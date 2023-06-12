// import
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");

//
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());
// jwt middleware
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  });
};

/* MongoDB */

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const classesCollections = client
      .db("harmonyAcademyDB")
      .collection("classes");
    const selectedClassesCollections = client
      .db("harmonyAcademyDB")
      .collection("selectedClasses");
    const enrolledClassesCollections = client
      .db("harmonyAcademyDB")
      .collection("enrolledClasses");
    /**/

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      next();
    };
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      next();
    };

    /*Api Portions*/

    /*Jwt api */
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send(token);
    });
    /**/

    /* Users or Students Api */
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already exists" });
      }
      console.log(user);
      const result = await usersCollections.insertOne(user);
      res.send(result);
    });
    app.get("/users/role/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ role: false });
      }
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const role = { role: user?.role };
      res.send(role);
    });
    /* */

    /* Instructors api */
    app.get("/instructors", async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 6;
      const skip = page * limit;
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
            $unwind: "$classes",
          },
          {
            $match: { "classes.status": "approved" },
          },
          {
            $group: {
              _id: "$_id",
              image: { $first: "$image" },
              name: { $first: "$name" },
              email: { $first: "$email" },
              gender: { $first: "$gender" },
              totalClasses: { $sum: 1 },
              totalStudents: { $sum: "$classes.EnrolledStudents" },
              classes: { $push: "$classes" },
            },
          },
          {
            $project: {
              _id: 1,
              image: 1,
              name: 1,
              email: 1,
              gender: 1,
              totalClasses: 1,
              totalStudents: 1,
              classes: 1,
            },
          },
          {
            $sort: {
              totalStudents: -1,
              name: 1,
            },
          },
          {
            $skip: skip,
          },
          {
            $limit: limit,
          },
        ])
        .toArray();
      res.send(instructors);
    });
    app.get("/instructors/:id", async (req, res) => {
      const id = req.params.id;
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
            $unwind: "$classes",
          },
          {
            $match: { "classes.status": "approved" },
          },
          {
            $group: {
              _id: "$_id",
              image: { $first: "$image" },
              name: { $first: "$name" },
              email: { $first: "$email" },
              gender: { $first: "$gender" },
              totalClasses: { $sum: 1 },
              totalStudents: { $sum: "$classes.EnrolledStudents" },
              classes: { $push: "$classes" },
            },
          },
          {
            $project: {
              _id: 1,
              image: 1,
              name: 1,
              email: 1,
              gender: 1,
              totalClasses: 1,
              totalStudents: 1,
              classes: 1,
            },
          },
          {
            $match: {
              _id: new ObjectId(id),
            },
          },
        ])
        .toArray();
      res.send(instructors);
    });
    app.get("/instructors-count", async (req, res) => {
      const result = await usersCollections.countDocuments({
        role: "Instructor",
      });
      res.send({ totalInstructors: result });
    });
    /**/

    /* Classes Api */
    app.get("/classes", async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 6;
      const skip = page * limit;
      const result = await classesCollections
        .aggregate([
          { $match: { status: "approved" } },
          { $sort: { EnrolledStudents: -1 } },
          { $skip: skip },
          { $limit: limit },
        ])
        .toArray();
      res.send(result);
    });

    app.get("/classes-count", async (req, res) => {
      const result = await classesCollections.countDocuments({
        status: "approved",
      });
      res.send({ totalClasses: result });
    });
    app.get("/selectedClasses/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const result = await selectedClassesCollections.findOne(email);
      res.send(result);
    });
    app.post("/selectedClasses", async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedClassesCollections.insertOne(selectedClass);
      res.send(result);
    });
    /* */

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
