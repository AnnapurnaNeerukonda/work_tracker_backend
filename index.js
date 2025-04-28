const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require("bcrypt");  // Ensure bcrypt is imported
const jwt = require("jsonwebtoken");
const app = express();
app.use(cors());
app.use(bodyParser.json());
require('dotenv').config();

const dbUri = 'mongodb+srv://annapurna2005k:annapurna2005k@cluster0.natn6ch.mongodb.net/saiSuneelAndCo?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(dbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch((error) => console.log('MongoDB connection error:', error));

if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
const employeeSchema = new mongoose.Schema({
  name: String,
  employee_code: String,
  designation: String,
  bank_name: String,
  ifsc_code: String,
  account_number: String,
  photo: String,
  phone_number: String,
  email: String,
  address: String,
});

const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

const workSchema = new mongoose.Schema({
  work_description: String,
  work_assigned_date: Date,
  pending_documents: Boolean,
  status: String,
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }
});

const Work = mongoose.models.Work || mongoose.model('Work', workSchema);

const clientSchema = new mongoose.Schema({
  name: String,
  business_name: String,
  pan_number: String,
  gstin_no: String,
  address: String,
  phone_number: String,
  reference_name: String,
  email_id: String,
  aadhar_number: String,
  client_pic: String,
  employee_id: String,  // Keep it for reference, optional if you link from Work
  employee_name: String,
});

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
});

const User = mongoose.model("User", UserSchema, "user");  // <- specify collection name
app.get("/test-user", async (req, res) => {
  try {
    const users = await User.find();  // Get all users
    res.json(users);  // Show all users
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});
app.get('/clients', async (req, res) => {
  try {
    const clients = await Client.find().populate('employee_id');
    // console.log(clients);
    res.status(200).send(clients);
  } catch (error) {
    res.status(500).send({
      message: 'Error fetching clients',
      error: error.message,
    });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const foundUser = await User.findOne({ email: email.toLowerCase() }).lean();
    if (!foundUser) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    if (foundUser.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ email: foundUser.email }, process.env.JWT_SECRET);
    console.log("User role:", foundUser.role); 
    res.status(200).json({ token, role: foundUser.role });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get('/reports', async (req, res) => {
  const { status, fromDate, toDate } = req.query;
  console.log(status, fromDate, toDate);

  try {
    let filterParams = {};

    const sanitizedFromDate = fromDate?.trim() || null;
    const sanitizedToDate = toDate?.trim() || null;
    if (sanitizedFromDate) {
      const from = new Date(sanitizedFromDate);
      from.setHours(0, 0, 0, 0); // include full day starting from 00:00
      filterParams.work_assigned_date = { $gte: from };
    }
    
    if (sanitizedToDate) {
      const to = new Date(sanitizedToDate);
      to.setHours(23, 59, 59, 999); // include entire day up to 23:59
      filterParams.work_assigned_date = {
        ...filterParams.work_assigned_date,
        $lte: to,
      };
    }
    

    if (status && status !== 'all') {
      filterParams.status = status;
    }

    const works = await Work.find(filterParams)
      .populate('clientId', 'name')
      .populate('employeeId', 'name')
      .exec();

    if (works.length === 0) {
      return res.status(200).json([]); // ✅ Don't 404 on empty results
    }

    const formattedWorks = works.map(work => ({
      client_name: work.clientId.name,
      employee_name: work.employeeId.name,
      work_assigned_date: new Date(work.work_assigned_date).toLocaleDateString(),
      status: work.status,
      description: work.work_description,
    }));

    res.json(formattedWorks);
  } catch (err) {
    console.error('Error fetching work:', err);
    res.status(500).json({ error: 'Database error', details: err });
  }
});
app.post('/clients', upload.single('client_pic'), async (req, res) => {
  const {
    name,
    business_name,
    pan_number,
    gstin_no,
    address,
    phone_number,
    reference_name,
    email_id,
    aadhar_number,
    employee_name,
    works, // JSON string
  } = req.body;

  try {
    // Find employee by name
    const employee = await Employee.findOne({ name: employee_name });
    if (!employee) {
      return res.status(404).json({ message: `Employee "${employee_name}" not found` });
    }

    let parsedWorks = [];
    if (works) {
      try {
        const rawWorks = JSON.parse(works);
        parsedWorks = rawWorks.map((work) => ({
          ...work,
          status: work.pending_documents ? "pending documents" : "in progress",
        }));
      } catch (err) {
        return res.status(400).send({ message: "Invalid format for works array" });
      }
    }

    // Save client first
    const newClient = new Client({
      name,
      business_name,
      pan_number,
      gstin_no,
      address,
      phone_number,
      reference_name,
      email_id,
      aadhar_number,
      client_pic: req.file ? req.file.filename : "",
      employee_id: employee._id.toString(),
      employee_name,
    });

    const savedClient = await newClient.save();

    // Save works to Work collection with references
    const workDocs = parsedWorks.map((work) => ({
      ...work,
      clientId: savedClient._id,
      employeeId: employee._id,
    }));

    const savedWorks = await Work.insertMany(workDocs);

    res.status(200).send({
      message: "Client and works added successfully",
      client: savedClient,
      works: savedWorks,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({
      message: "Error adding client and works",
      error: error.message,
    });
  }
});
app.get('/work/:clientId', async (req, res) => {
  const { clientId } = req.params;
  console.log("Fetching work for clientId:", clientId);

  try {
    // First, ensure client exists (optional)
    const client = await Client.findById(clientId);
    if (!client) {
      console.log("Client not found");
      return res.status(404).send({ message: 'Client not found' });
    }

    // Fetch all work items from Work collection related to this client
    const workDetails = await Work.find({ clientId }).populate('employeeId', 'name employee_code');

    res.status(200).send(workDetails);
  } catch (error) {
    console.error("Error fetching work details:", error);
    res.status(500).send({
      message: 'Error fetching work details',
      error: error.message,
    });
  }
});
app.post('/add-work', async (req, res) => {
  const { client_id, employee_id, work_description, pending_documents } = req.body;
  try {
  
    // Find Client by name
    const client = await Client.findOne({ _id: client_id });
    if (!client) {
      console.log("client not found")
      return res.status(404).json({ message: 'Client not found' });
    }

    // Find Employee by name
    const employee = await Employee.findOne({ _id: employee_id });
    if (!employee) {
      console.log("employee not found")
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Determine status
    const status = pending_documents ? 'pending documents' : 'in progress';

    // Create new Work
    const newWork = new Work({
      work_description,
      work_assigned_date: new Date(),
      pending_documents,
      status,
      employeeId: employee._id,
      clientId: client._id,
    });

    await newWork.save();

    res.status(201).json({
      message: 'Work added successfully',
      work: newWork,
    });
  } catch (error) {
    console.log(error.message)
    console.error('Error adding work:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


app.get('/search/:term', async (req, res) => {
    const term = req.params.term;
  
    try {
      const results = await Client.find({
        name: { $regex: term, $options: 'i' }, // Case-insensitive search
      });
  
      res.status(200).send(results);
    } catch (error) {
      res.status(500).send({
        message: 'Error searching clients',
        error: error.message,
      });
    }
  });
  
app.post('/add-employee', upload.single('photo'), async (req, res) => {
  const {
    name,
    employee_code,
    designation,
    bank_name,
    ifsc_code,
    account_number,
    phone_number,
    email,
    address,
  } = req.body;

  const existingEmployee = await Employee.findOne({ employee_code });

  if (existingEmployee) {
    console.log("employee code exists")
    return res.status(400).send({
      message: 'Employee code already exists. Please use a different employee code.',
    });
  }

  const newEmployee = new Employee({
    name,
    employee_code,
    designation,
    bank_name,
    ifsc_code,
    account_number,
    photo: req.file ? req.file.filename : '',
    phone_number,
    email,
    address,
  });

  try {
    await newEmployee.save();
    res.status(200).send({
      message: 'Employee added successfully',
      employee: newEmployee,
    });
  } catch (error) {
    console.log(error.message)
    res.status(500).send({
      message: 'Error adding employee',
      error: error.message,
    });
  }
});

app.get('/employees', async (req, res) => {
  try {
    const employees = await Employee.find();
    res.status(200).send(employees);
  } catch (error) {
    res.status(500).send({
      message: 'Error fetching employees',
      error: error.message,
    });
  }
});

app.get('/employee/:id/work', async (req, res) => {
  try {
    const employeeId = req.params.id;
    console.log(employeeId)
    const workItems = await Work.find({ employeeId: employeeId }).populate('clientId', 'name');
    console.log("entered work for employee api");
    console.log(workItems)
    res.json(workItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while fetching work.' });
  }
});
app.put('/work/:workId', async (req, res) => {
  const { work_completed_date } = req.body;

  try {
    const work = await Work.findById(req.params.workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });

    let updatedStatus = work.status;
    if (work_completed_date) {
      if (work.status === 'pending') {
        updatedStatus = 'in progress';
      } else {
        updatedStatus = 'completed';
      }
    }

    work.work_completed_date = work_completed_date;
    work.status = updatedStatus;

    const updatedWork = await work.save();

    res.status(200).json(updatedWork);
  } catch (err) {
    console.error('Error updating work:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// app.put('/work/:workId', async (req, res) => {
//   const { work_completed_date } = req.body;

//   try {
//     const updatedWork = await Work.findByIdAndUpdate(
//       req.params.workId,
//       {
//         work_completed_date,
//         status: work_completed_date ? 'completed' : 'in progress',
//       },
//       { new: true }
//     );

//     if (!updatedWork) return res.status(404).json({ message: 'Work not found' });

//     res.status(200).json(updatedWork);
//   } catch (err) {
//     console.error('Error updating work:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
