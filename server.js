require('dotenv').config();
const express = require('express');
const imaps = require('imap-simple');
const mongoose = require('mongoose');
const CandleData = require('./models/CandleData');
const _ = require('lodash');
const bodyParser = require('body-parser');
const he = require('he'); 
const cron = require('node-cron');
const app = express();
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.log("Error connecting to MongoDB:", err));

const config = {
    imap: {
        user: process.env.GMAIL_USER,
        password: process.env.GMAIL_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 3000,
        tlsOptions: {
            rejectUnauthorized: false,
        }
    }
};

async function readEmails() {
    try {
        const connection = await imaps.connect({ imap: config.imap });
        await connection.openBox('INBOX');
        console.log("Reading unseen emails...");

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);

        console.log(`Found ${messages.length} unseen emails`);

        for (let message of messages) {
            const parts = _.find(message.parts, { which: 'TEXT' });
            const emailBody = parts ? parts.body : null;

            if (emailBody) {
                const candleData = extractCandleData(emailBody);

                if (candleData) {
                    try {
                        const data = await CandleData.create(candleData);
                        console.log("Candle data stored:", data);
                    } catch (dbErr) {
                        console.error("Error storing candle data:", dbErr);
                    }
                } else {
                    console.log("No valid candle data found in email.");
                }
            } else {
                console.log("No text body found in email.");
            }
        }

        connection.end();
    } catch (err) {
        console.error("Error reading emails:", err);
    }
}


function extractCandleData(body) {
    try {
        console.log("Email body content:", body);

        const jsonRegex = /{&#34;time&#34;:.*?&#34;volume&#34;:\d+}/s;

        const jsonMatch = body.match(jsonRegex);

        // Check if the match exists
        if (jsonMatch && jsonMatch[0]) {
            let jsonString = jsonMatch[0];
            jsonString = he.decode(jsonString);
            console.log("Decoded JSON string before cleanup:", jsonString);

            jsonString = jsonString
                .replace(/=|;/g, '') 
                .replace(/\s+/g, ' ')
                .replace(/: /g, ':') 
                .replace(/(\d)\s+(\d)/g, '$1$2') 
                .replace(/(\d+)\s*\.\s*(\d+)/g, '$1.$2'); 

            console.log("Cleaned JSON string:", jsonString);

            const candleData = JSON.parse(jsonString);

            if (candleData.time && candleData.open && candleData.high && candleData.low && candleData.close && candleData.volume) {
                return candleData;
            } else {
                console.error("Missing candle data fields");
                return null;
            }
        } else {
            console.error("No JSON data found in email");
            return null;
        }
    } catch (err) {
        console.error("Error extracting candle data:", err);
        return null;
    }
}
// Route to manually trigger reading emails
app.get('/read-emails', (req, res) => {
    readEmails()
        .then(() => res.json({ "message": "Emails processed" }))
        .catch(err => res.status(500).json({ "message": "Error processing emails" }));
});


cron.schedule('* * * * *', () => {
    console.log('Running cron job to read emails...');
    readEmails();
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
