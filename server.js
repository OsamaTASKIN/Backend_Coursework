const express = require("express");
const path = require("path");
const { MongoClient, ObjectID } = require("mongodb");

const app = express();

app.use(express.json());
app.set("port", 3000);

// Log function with timestamp and date
function logActivity(activity, details = "") {
  const time = new Date();
  const formattedTime = time.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const logMessage = `[${formattedTime}] ${activity}${details ? ` | ${details}` : ""}`;
  console.log(logMessage);
}

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
      logActivity("Error", `Failed to connect to MongoDB: ${err.message}`);
      process.exit(1);
    }
    db = client.db("School__Activities");
    logActivity("Info", "Connected to MongoDB");
  }
);

// Serve Static Images
const imagesPath = path.join(__dirname, "images");
app.use("/images", express.static(imagesPath));

// Example Endpoint to Test Static Files
app.get("/test-image", (req, res) => {
  logActivity("Info", "Test image endpoint hit");
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
      logActivity("Info", `User searched for: ${searchQuery}`);
    } else {
      logActivity("Warning", "Search query is missing or empty");
    }
  }
  next(); // Proceed to the next middleware or route handler
});

// Log search activities and fetch matching results from 'lessons' collection
app.get("/log-search", async (req, res) => {
  const searchQuery = req.query.query?.trim(); // Extract query parameter
  if (!searchQuery) {
    logActivity("Warning", "Search query is missing in the request parameters");
    return res.status(400).send({ msg: "Search query is required" });
  }

  logActivity("Info", `Search activity recorded: ${searchQuery}`);

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

    logActivity("Info", `Search results for '${searchQuery}': ${results.length} items found`);
    res.send(results);
  } catch (error) {
    logActivity("Error", `Error fetching search results: ${error.message}`);
    res.status(500).send({ msg: "Error fetching search results" });
  }
});

app.get("/", (req, res) => {
  logActivity("Info", "Root endpoint hit");
  res.send("Select a collection, e.g., /collection/messages");
});

// Collection Routes (for MongoDB)
app.param("collectionName", (req, res, next, collectionName) => {
  req.collection = db.collection(collectionName);
  logActivity("Info", `Accessed collection: ${collectionName}`);
  return next();
});

app.get("/collection/:collectionName", (req, res, next) => {
  req.collection.find({}).toArray((e, results) => {
    if (e) return next(e);
    logActivity("Info", `Fetched all documents from collection: ${req.params.collectionName}`);
    res.send(results);
  });
});

app.post("/collection/:collectionName", (req, res, next) => {
  req.collection.insertOne(req.body, (e, result) => {
    if (e) return next(e);
    logActivity("Info", `Inserted document into collection: ${req.params.collectionName}`);
    res.send(result.ops[0]);
  });
});

app.get("/collection/:collectionName/:id", (req, res, next) => {
  req.collection.findOne({ _id: new ObjectID(req.params.id) }, (e, result) => {
    if (e) return next(e);
    logActivity("Info", `Fetched document with ID: ${req.params.id}`);
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
      logActivity(
        result.matchedCount === 1 ? "Info" : "Warning",
        `Updated document with ID: ${req.params.id}`
      );
      res.send(result.matchedCount === 1 ? { msg: "success" } : { msg: "error" });
    }
  );
});

app.delete("/collection/:collectionName/:id", (req, res, next) => {
  req.collection.deleteOne({ _id: new ObjectID(req.params.id) }, (e, result) => {
    if (e) return next(e);
    logActivity(
      result.deletedCount === 1 ? "Info" : "Warning",
      `Deleted document with ID: ${req.params.id}`
    );
    res.send(result.deletedCount === 1 ? { msg: "success" } : { msg: "error" });
  });
});

// Enhanced Search Endpoint
app.get("/search", async (req, res) => {
  const query = req.query.q; // Extract the search query from the request
  if (!query) {
    logActivity("Warning", "Search query missing");
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

    logActivity("Info", `Search query: '${query}' returned ${results.length} results`);
    res.send(results);
  } catch (error) {
    logActivity("Error", `Error during search: ${error.message}`);
    res.status(500).send({ msg: "Error during search", error });
  }
});

// Place Order Endpoint
app.post("/place-order", async (req, res) => {
  const orderData = req.body;

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
    logActivity("Warning", "Incomplete order data received");
    return res.status(400).send({ msg: "Incomplete order data" });
  }

  try {
    const orderResult = await db.collection("orders").insertOne(orderData);
    logActivity("Info", `Order placed successfully: ${orderResult.insertedId}`);

    const bulkOperations = orderData.cart.map((item) => ({
      updateOne: {
        filter: { id: item.id },
        update: { $inc: { AvailableInventory: -1 } },
      },
    }));

    const inventoryUpdateResult = await db
      .collection("lessons")
      .bulkWrite(bulkOperations);

    logActivity("Info", `Inventory updated: ${inventoryUpdateResult.modifiedCount} items modified`);
    res.status(200).send({ msg: "Order placed successfully!" });
  } catch (error) {
    logActivity("Error", `Error placing order: ${error.message}`);
    res.status(500).send({ msg: "Error placing order", error: error.message });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logActivity("Info", `Server running on port ${port}`);
});
