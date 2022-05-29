const express = require('express');
const port = process.env.PORT || 5000;
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const objectId = require('mongodb').ObjectId;
const { decode } = require('jsonwebtoken');
const verify = require('jsonwebtoken/verify');
app.use(cors());
app.use(express.json());
require('dotenv').config();

const stripe = require("stripe")('sk_test_51L0fKtJ9YTsnQW1SuYikyuRI0QFscPAAslgEpj37jMRYTOvQngMxvchpjn9PWtIZYSszuqdsIOoF7Bprj4mVnSmR00nV7H9XHg');


app.get('/', (req, res) => {
    res.send(' doctors portal server is running')
})

const verifyjwt = (req, res, next) => {
    const autheader = req.headers.authorization;
    if (!autheader) {
        return res.status(401).send({ message: "unauthorized access" })
    }

    const token = autheader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "forbidden access" })
        }
        req.decoded = decoded;

        next();
    })

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ueblu.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const run = async () => {
    try {
        await client.connect();
        const doctorsportalservice = client.db("doctors-portal").collection("services");
        const doctorsportalbooking = client.db("doctors-portal").collection("booking");
        const doctorsportaluser = client.db("doctors-portal").collection("user");
        const doctorsportaldoctors = client.db("doctors-portal").collection("doctors");
        const doctorsportalpayment = client.db("doctors-portal").collection("payment");

        const verifyadmin = async (req, res, next) => {
            const requester = req.decoded.email;

            const requesteracount = await doctorsportaluser.findOne({ email: requester });

            if (requesteracount.role === "admin") {
                next();
            } else {
                res.status(403).send({ message: "forbiden" })
            }

        }



        app.get('/payment', async (req, res) => {
            const id = req.query.id;
            const query = { _id: ObjectId(id) }
            const result = await doctorsportalbooking.findOne(query);
            res.send(result);
        })


        app.post("/create-payment-intent", verifyjwt, async (req, res) => {
            const items = req.body;
            const price = parseInt(items.price)
            const amount = price * 100;


            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });




        app.get('/users', verifyjwt, async (req, res) => {
            const result = await doctorsportaluser.find().toArray();
            res.send(result);

        })
        app.post('/doctor', verifyjwt, verifyadmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsportaldoctors.insertOne(doctor);
            res.send(result);
        })

        app.get('/doctors', verifyjwt, verifyadmin, async (req, res) => {
            const services = await doctorsportaldoctors.find().toArray();
            res.send(services)
        })

        app.delete('/doctors/:email', verifyjwt, verifyadmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorsportaldoctors.deleteOne(filter);
            res.send(result)
        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;

            const users = await doctorsportaluser.findOne({ email: email });

            const isAdmin = users.role === "admin";
            res.send({ admin: isAdmin })

        })


        app.put('/user/admin/:email', verifyjwt, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAcount = await doctorsportaluser.findOne({ email: requester })
            if (requesterAcount.role === "admin") {
                filter = { email: email };

                const updateDoc = {
                    $set: { role: 'admin' },
                };

                const result = await doctorsportaluser.updateOne(filter, updateDoc);

                res.send(result);
            } else {
                res.status(403).send({ message: "forbiden" })
            }

        })




        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };

            const result = await doctorsportaluser.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
                expiresIn: '1h'
            })
            res.send({ result, accesstoken: token });
        })



        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = doctorsportalservice.find(query).project({ name: 1 });
            const result = await cursor.toArray();
            res.send(result);
        })




        app.get('/booking', verifyjwt, async (req, res) => {

            const paitent = req.query.email;
            const query = { paitent: paitent }
            const decodedmail = req.decoded.email;

            if (decodedmail === paitent) {
                const result = await doctorsportalbooking.find(query).toArray();
                res.send(result)
            } else {
                return res.status(403).send({ message: "forbidden access" })
            }

        })

        app.patch('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            console.log(payment);
            const query = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,

                }
            }
            const result = await doctorsportalpayment.insertOne(payment);
            const updatebooking = await doctorsportalbooking.updateOne(query, updateDoc);
            res.send(updatebooking)

        })


        app.post('/booking', async (req, res) => {

            const booking = req.body;
            const query = {
                treatment: booking.treatment, date: booking.date, paitent: booking.paitent

            }
            const exist = await doctorsportalbooking.findOne(query);
            if (exist) {
                return res.send({ success: "faild", booking: "exist" })
            }
            const result = await doctorsportalbooking.insertOne(booking);
            res.send(result)
        })

        app.get('/aivilable', async (req, res) => {
            const date = req.query.date;


            const services = await doctorsportalservice.find().toArray();

            const query = { date: date }
            const booking = await doctorsportalbooking.find(query).toArray();


            services.forEach((service) => {
                const servicebooking = booking.filter((b) => b.treatment === service.name);
                const booked = servicebooking.map((val) => val.slot)

                const avilable = service.slots.filter((s) => !booked.includes(s))
                service.slots = avilable


            })

            res.send(services)

        })



    } finally {

    }

}

run().catch(console.dir)


app.listen(port, () => {
    console.log(`your sever is running on ${port}`);
})