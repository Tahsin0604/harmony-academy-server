// import
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
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
    // await client.connect();
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
    app.get("/users/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      const result = await usersCollections.findOne({ email: email });
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already exists" });
      }
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
    //for admin
    app.get("/all-users", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await usersCollections.find().toArray();
      res.send(result);
    });
    app.patch("/user-role/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: body.role,
        },
      };
      const result = await usersCollections.updateOne(query, updatedDoc);
      res.send(result);
    });
    /* */

    /* Instructors api */
    app.get("/instructors", async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 6;
      const skip = page * limit;

      const instructors = await usersCollections
        .aggregate([
          { $match: { role: "instructor" } },
          {
            $lookup: {
              from: "classes",
              localField: "email",
              foreignField: "instructorEmail",
              as: "classes",
            },
          },
          {
            $addFields: {
              classes: {
                $cond: [
                  { $eq: [{ $size: "$classes" }, 0] },
                  { onProcessing: true },
                  {
                    $cond: [
                      { $eq: [{ $size: "$classes.status" }, 0] },
                      { onProcessing: true },
                      "$classes",
                    ],
                  },
                ],
              },
            },
          },
          {
            $unwind: "$classes",
          },
          {
            $group: {
              _id: "$_id",
              image: { $first: "$image" },
              name: { $first: "$name" },
              email: { $first: "$email" },
              gender: { $first: "$gender" },
              totalClasses: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        // { $eq: [{ $ifNull: ["$classes", null] }, null] },
                        {
                          $eq: [
                            { $ifNull: ["$classes.status", null] },
                            "approved",
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalStudents: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        // { $eq: [{ $ifNull: ["$classes", null] }, null] },
                        {
                          $eq: [
                            { $ifNull: ["$classes.status", null] },
                            "approved",
                          ],
                        },
                      ],
                    },
                    "$classes.EnrolledStudents",
                    0,
                  ],
                },
              },
              classes: {
                $push: {
                  $cond: [
                    {
                      $eq: [{ $ifNull: ["$classes.status", null] }, "approved"],
                    },
                    "$classes",
                    null,
                  ],
                },
              },
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
              classes: {
                $filter: {
                  input: "$classes",
                  as: "class",
                  cond: { $ne: ["$$class", null] },
                },
              },
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
          { $match: { role: "instructor" } },
          {
            $lookup: {
              from: "classes",
              localField: "email",
              foreignField: "instructorEmail",
              as: "classes",
            },
          },
          {
            $addFields: {
              classes: {
                $cond: [
                  { $eq: [{ $size: "$classes" }, 0] },
                  { onProcessing: true },
                  {
                    $cond: [
                      { $eq: [{ $size: "$classes.status" }, 0] },
                      { onProcessing: true },
                      "$classes",
                    ],
                  },
                ],
              },
            },
          },
          {
            $unwind: "$classes",
          },
          {
            $group: {
              _id: "$_id",
              image: { $first: "$image" },
              name: { $first: "$name" },
              email: { $first: "$email" },
              gender: { $first: "$gender" },
              totalClasses: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        // { $eq: [{ $ifNull: ["$classes", null] }, null] },
                        {
                          $eq: [
                            { $ifNull: ["$classes.status", null] },
                            "approved",
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalStudents: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        // { $eq: [{ $ifNull: ["$classes", null] }, null] },
                        {
                          $eq: [
                            { $ifNull: ["$classes.status", null] },
                            "approved",
                          ],
                        },
                      ],
                    },
                    "$classes.EnrolledStudents",
                    0,
                  ],
                },
              },
              classes: {
                $push: {
                  $cond: [
                    {
                      $eq: [{ $ifNull: ["$classes.status", null] }, "approved"],
                    },
                    "$classes",
                    null,
                  ],
                },
              },
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
              classes: {
                $filter: {
                  input: "$classes",
                  as: "class",
                  cond: { $ne: ["$$class", null] },
                },
              },
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
        role: "instructor",
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
    app.patch("/classes/:id", verifyJwt, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollections.replaceOne(query, body);
      res.send(result);
    });
    app.get("/classes/:id", verifyJwt, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollections.findOne(query);
      res.send(result);
    });
    app.post("/classes", verifyJwt, verifyInstructor, async (req, res) => {
      const body = req.body;
      const result = await classesCollections.insertOne(body);
      res.send(result);
    });
    app.get("/classes-count", async (req, res) => {
      const result = await classesCollections.countDocuments({
        status: "approved",
      });
      res.send({ totalClasses: result });
    });
    app.get("/selectedClasses", verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      const result = await selectedClassesCollections
        .find({ studentEmail: email })
        .toArray();
      res.send(result);
    });
    app.post("/selectedClasses", async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;
      const query = { $and: [{ classId: id }, { studentEmail: email }] };
      const classExist = await selectedClassesCollections.findOne(query);
      const enrolledExist = await enrolledClassesCollections.findOne(query);

      if (classExist) {
        return res.send({ exist: "Already selected" });
      }
      if (enrolledExist) {
        return res.send({ exist: "Already enrolled" });
      }
      const selectedClass = req.body;

      const result = await selectedClassesCollections.insertOne(selectedClass);
      res.send(result);
    });
    app.delete("/selectedClasses/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassesCollections.deleteOne(query);
      res.send(result);
    });
    app.get("/enrolledClasses", verifyJwt, async (req, res) => {
      const email = req.query.email;
      const sortType = req.query.sortType || "asc";
      if (!email) {
        return res.send([]);
      }
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      let sort = {
        paidAt: 1,
      };
      if (sortType !== "asc") {
        sort = {
          paidAt: -1,
        };
      }
      const query = { studentEmail: email };
      const result = await enrolledClassesCollections
        .find(query)
        .sort(sort)
        .toArray();
      res.send(result);
    });
    app.get("/enrolledClasses/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await enrolledClassesCollections.findOne(query);
      res.send(result);
    });
    app.patch("/availabe-classes", async (req, res) => {
      const classId = req.query.classId;
      const selectedClassId = req.query.selectedClassId;
      const queryClass = { _id: new ObjectId(classId) };
      const querySelected = { _id: new ObjectId(selectedClassId) };
      const option = { projection: { _id: 0, availableSeats: 1 } };
      const result = await classesCollections.findOne(queryClass, option);
      if (result.availableSeats < 1) {
        const updatedDocs = {
          $set: {
            status: "Filled Up",
          },
        };
        const updatedResult = await selectedClassesCollections.updateOne(
          querySelected,
          updatedDocs
        );
        return res.send(updatedResult);
      }
      res.send(result);
    });
    // api only for instructor
    app.get(
      "/my-classes/:email",
      verifyJwt,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden Access" });
        }
        const result = await classesCollections
          .find({ instructorEmail: email })
          .toArray();
        res.send(result);
      }
    );
    //api only for admin
    app.get("/all-classes", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await classesCollections.find().toArray();
      res.send(result);
    });
    app.patch(
      "/class-feedback/:id",
      verifyJwt,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const body = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            feedback: body.feedback,
          },
        };
        const result = await classesCollections.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.patch("/class-status/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: body.status,
        },
      };
      const result = await classesCollections.updateOne(query, updatedDoc);

      res.send(result);
    });
    /* */

    /*statistics*/
    //for student
    app.get("/student-statistics", verifyJwt, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      const selectedClassResult =
        await selectedClassesCollections.countDocuments({
          studentEmail: email,
        });
      const enrolledClassResult =
        await enrolledClassesCollections.countDocuments({
          studentEmail: email,
        });
      res.send({
        selectedClasses: selectedClassResult,
        enrolledClasses: enrolledClassResult,
      });
    });
    app.get(
      "/instructor-statistics",
      verifyJwt,
      verifyInstructor,
      async (req, res) => {
        const email = req.query.email;
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden Access" });
        }
        const totalClasses = await classesCollections.countDocuments({
          instructorEmail: email,
        });
        const totalApprovedClasses = await classesCollections.countDocuments({
          $and: [{ instructorEmail: email }, { status: "approved" }],
        });
        const totalDeniedClasses = await classesCollections.countDocuments({
          $and: [{ instructorEmail: email }, { status: "denied" }],
        });
        const totalPendingClasses = await classesCollections.countDocuments({
          $and: [{ instructorEmail: email }, { status: "pending" }],
        });
        const totalEnrolledStudent = await classesCollections
          .aggregate([
            {
              $match: {
                status: "approved",
              },
            },
            {
              $match: {
                instructorEmail: email,
              },
            },
            {
              $group: {
                _id: null,
                totalEnrolledStudents: { $sum: "$EnrolledStudents" },
              },
            },
            {
              $project: {
                _id: 0,
                totalEnrolledStudents: 1,
              },
            },
          ])
          .toArray();

        res.send({
          totalClasses: totalClasses,
          totalApprovedClasses: totalApprovedClasses,
          totalDeniedClasses: totalDeniedClasses,
          totalPendingClasses: totalPendingClasses,
          totalEnrolledStudent: totalEnrolledStudent[0].totalEnrolledStudents,
        });
      }
    );
    app.get("/admin-statistics", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      const totalClasses = await classesCollections.countDocuments();
      const totalApprovedClasses = await classesCollections.countDocuments({
        status: "approved",
      });
      const totalDeniedClasses = await classesCollections.countDocuments({
        status: "denied",
      });
      const totalPendingClasses = await classesCollections.countDocuments({
        status: "pending",
      });
      const totalEnrolledStudent = await classesCollections
        .aggregate([
          {
            $match: {
              status: "approved",
            },
          },
          {
            $group: {
              _id: null,
              totalEnrolledStudents: { $sum: "$EnrolledStudents" },
            },
          },
          {
            $project: {
              _id: 0,
              totalEnrolledStudents: 1,
            },
          },
        ])
        .toArray();

      const totalInstructor = await usersCollections.countDocuments({
        role: "instructor",
      });
      res.send({
        totalClasses: totalClasses,
        totalApprovedClasses: totalApprovedClasses,
        totalDeniedClasses: totalDeniedClasses,
        totalPendingClasses: totalPendingClasses,
        totalEnrolledStudent: totalEnrolledStudent[0].totalEnrolledStudents,
        totalInstructor: totalInstructor,
      });
    });
    /**/

    /* Payment Api */
    app.post("/create-payment-intent", verifyJwt, async (req, res) => {
      const { amount } = req.body;
      const amountPay = amount * 100;
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountPay,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/payment", verifyJwt, async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const body = req.body;
      const updateClassQuery = { _id: new ObjectId(req.body.classId) };
      const updatedDocs = {
        $inc: {
          EnrolledStudents: 1,
          availableSeats: -1,
        },
      };
      const insertedResult = await enrolledClassesCollections.insertOne(body);
      const deletedResult = await selectedClassesCollections.deleteOne(query);
      const updatedResult = await classesCollections.updateOne(
        updateClassQuery,
        updatedDocs
      );
      res.send({ insertedResult, deletedResult, updatedResult });
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
