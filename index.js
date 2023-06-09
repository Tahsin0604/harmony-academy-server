// import
const express = require("express");
const cors = require("cors");
require("dotenv").config();

//
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

/* MongoDB */

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.hrqu461.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    /*collections */
    const reviewsCollections = client
      .db("harmonyAcademyDB")
      .collection("reviews");
    const usersCollections = client.db("harmonyAcademyDB").collection("users");

    /**/

    /*Api Portions*/
    /* Instructors api */
    app.get("/instructors", async (req, res) => {
      const instructors = await usersCollections
        .aggregate([
          { $match: { role: "Instructor" } },
          {
            $lookup: {
              from: "classes",
              localField: "email",
              foreignField: "instructorEmail",
              as: "classes",
            },
          },
          {
            $project: {
              _id: 1,
              image: 1,
              name: 1,
              email: 1,
              gender: 1,
              activeClasses: 1,
              totalClasses: { $size: "$classes" },
              totalStudents: { $sum: "$classes.EnrolledStudents" },
            },
          },
        ])
        .toArray();
      // const result= await
      res.send(instructors);
    });

    /**/
    /*Reviews api */
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollections.find().toArray();
      res.send(result);
    });
    /**/

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

/**/

app.get("/", (req, res) => {
  res.send("Harmony Academy server");
});
app.listen(port, () => {
  console.log("port no: ", port);
});
