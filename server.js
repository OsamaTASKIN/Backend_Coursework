const express = require("express");
const path = require("path");
const { MongoClient, ObjectID } = require("mongodb");

const app = express();

app.use(express.json());
app.set("port", 3000);

// CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  next();
});

// MongoDB Connection
let db;
MongoClient.connect(
  "mongodb+srv://osama:osama@cluster0.gg4u5.mongodb.net/",
  (err, client) => {
    if (err) {
      console.error("Failed to connect to MongoDB:", err);
      process.exit(1);
    }
    db = client.db("School__Activities");
    console.log("Connected to MongoDB");
  }
);

// Serve Static Images
const imagesPath = path.join(__dirname, "images");
app.use("/images", express.static(imagesPath));

// Example Endpoint to Test Static Files
app.get("/test-image", (req, res) => {
  res.send({
    imageUrl: `${req.protocol}://${req.get("host")}/images/example.jpg`, // Replace "example.jpg" with your image filename
  });
});

// Middleware to log search queries dynamically using RegExp
app.use((req, res, next) => {
  const searchRegex = /log-search/; // Matches the /log-search endpoint
  if (searchRegex.test(req.url) && req.method === "GET") {
    const searchQuery = req.query.query?.trim(); // Extract search query
    if (searchQuery) {
      console.log(`User searched for: ${searchQuery}`); // Log the search term
    } else {
      console.warn("Search query is missing or empty");
    }
  }
  next(); // Proceed to the next middleware or route handler
});

// Log search activities and fetch matching results from 'lessons' collection
app.get("/log-search", async (req, res) => {
  const searchQuery = req.query.query?.trim(); // Extract query parameter
  if (!searchQuery) {
    console.warn("Search query is missing in the request parameters");
    return res.status(400).send({ msg: "Search query is required" });
  }

  console.log(`Search activity recorded: ${searchQuery}`);

  try {
    const results = await db
      .collection("lessons")
      .find({
        $or: [
          { title: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search on 'title'
          { description: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search on 'description'
        ],
      })
      .toArray();

    console.log(`Search results for '${searchQuery}':`, results);

    res.send(results);
  } catch (error) {
    console.error(`Error fetching search results: ${error.message}`);
    res.status(500).send({ msg: "Error fetching search results" });
  }
});

app.get("/", (req, res) => {
  res.send("Select a collection, e.g., /collection/messages");
});

// Collection Routes (for MongoDB)
app.param("collectionName", (req, res, next, collectionName) => {
  req.collection = db.collection(collectionName);
  return next();
});

app.get("/collection/:collectionName", (req, res, next) => {
  req.collection.find({}).toArray((e, results) => {
    if (e) return next(e);
    res.send(results);
  });
});

app.post("/collection/:collectionName", (req, res, next) => {
  req.collection.insertOne(req.body, (e, result) => {
    if (e) return next(e);
    res.send(result.ops[0]);
  });
});

app.get("/collection/:collectionName/:id", (req, res, next) => {
  req.collection.findOne({ _id: new ObjectID(req.params.id) }, (e, result) => {
    if (e) return next(e);
    res.send(result);
  });
});

app.put("/collection/:collectionName/:id", (req, res, next) => {
  req.collection.updateOne(
    { _id: new ObjectID(req.params.id) },
    { $set: req.body },
    { safe: true },
    (e, result) => {
      if (e) return next(e);
      res.send(result.matchedCount === 1 ? { msg: "success" } : { msg: "error" });
    }
  );
});

app.delete("/collection/:collectionName/:id", (req, res, next) => {
  req.collection.deleteOne({ _id: new ObjectID(req.params.id) }, (e, result) => {
    if (e) return next(e);
    res.send(result.deletedCount === 1 ? { msg: "success" } : { msg: "error" });
  });
});

// Enhanced Search Endpoint
app.get("/search", async (req, res) => {
  const query = req.query.q; // Extract the search query from the request
  if (!query) {
    console.log("Search query missing"); // Log if query is missing
    return res.status(400).send({ msg: "Query parameter is required" });
  }

  try {
    const searchRegex = new RegExp(query, "i");

    const results = await db
      .collection("School__Activities")
      .find({
        $or: [
          { title: searchRegex },
          { subject: searchRegex },
          { location: searchRegex },
        ],
      })
      .toArray();

    console.log(`Search query: ${query}`);
    console.log("Search results:", results);

    res.send(results);
  } catch (error) {
    console.error("Error during search:", error); // Log any errors
    res.status(500).send({ msg: "Error during search", error });
  }
});

// Place Order Endpoint
app.post("/place-order", async (req, res) => {
  const orderData = req.body;

  // Validate required fields
  if (
    !orderData.firstName ||
    !orderData.lastName ||
    !orderData.address ||
    !orderData.city ||
    !orderData.state ||
    !orderData.zip ||
    !orderData.phone ||
    !orderData.method ||
    !orderData.cart ||
    orderData.cart.length === 0
  ) {
    return res.status(400).send({ msg: "Incomplete order data" });
  }

  try {
    // Insert the order into the "orders" collection
    const orderResult = await db.collection("orders").insertOne(orderData);
    console.log("Order successfully placed:", orderResult.insertedId);

    // Update the AvailableInventory in the "lessons" collection
    const bulkOperations = orderData.cart.map((item) => ({
      updateOne: {
        filter: { id: item.id },
        update: { $inc: { AvailableInventory: -1 } }, // Decrease inventory
      },
    }));

    const inventoryUpdateResult = await db
      .collection("lessons")
      .bulkWrite(bulkOperations);
    console.log("Inventory updated:", inventoryUpdateResult);

    res.status(200).send({ msg: "Order placed successfully!" });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).send({ msg: "Error placing order", error: error.message });
  }
});


// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
