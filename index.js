
const express = require('express'); 
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

// Configure CORS to allow only your frontend domain
const allowedOrigins = [
  'https://work-tracker-frontend-git-main-annapurnaneerukondas-projects.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


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
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  work_completed_date:Date,
  fee_estimation: String,
  amount: Number,
  discount: Number, 
  total_bill: Number,
  isPaid: { type: Boolean, default: false }
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

const User = mongoose.model("User", UserSchema, "user");

const paymentSchema = new mongoose.Schema({
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  work_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
  amount: { type: Number, required: true },
  discount_percentage: { type: Number, required: true },
  total_bill: { type: Number, required: true },
  payment_date: { type: Date, required: true },
});
const Payment = mongoose.model("Payment", paymentSchema, "payments");


app.get('/unpaid-works/:clientId', async (req, res) => {
  try {
    console.log("Client ID:", req.params.clientId);
    const works = await Work.find({
      clientId: req.params.clientId,
      isPaid: false // ✅ filter only unpaid works
    });
    res.json(works);
  } catch (err) {
    console.error("Error fetching unpaid works:", err);
    res.status(500).json({ error: 'Failed to fetch unpaid works' });
  }
});

app.post('/submit-bill', async (req, res) => {
  try {
    const { workId, amount, discount } = req.body;
    const discountAmt = (amount * discount) / 100;
    const total_bill = amount - discountAmt;
    console.log(total_bill , workId , amount , discount)
    const updatedWork = await Work.findByIdAndUpdate(workId, {
      amount,
      discount,
      total_bill,
      isPaid: true
    }, { new: true });
    console.log(updatedWork)
    res.json({ message: "Bill updated successfully", updatedWork });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit bill' });
  }
});
app.get('/payments/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const payments = await Payment.find({ client_id: clientId }).populate('work_id');
    
    if (!payments.length) {
      return res.status(404).json({ message: 'No payments found for this client' });
    }

    const paymentDetails = payments.map(payment => ({
      work_description: payment.work_id.description, // Assuming 'description' is a field in Work schema
      amount: payment.amount,
      discount_percentage: payment.discount_percentage,
      total_bill: payment.total_bill,
      payment_date: payment.payment_date,
    }));

    res.status(200).json(paymentDetails);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

app.post('/add-payment', async (req, res) => {
  const { client_id, work_id, amount, discount_percentage } = req.body;
  const payment_date = new Date();

  try {
    if (!client_id || !work_id || !amount || !discount_percentage) {
      return res.status(400).send('All fields are required');
    }

    // Calculate the total bill after discount
    const discountAmount = (amount * discount_percentage) / 100;
    const total_bill = amount - discountAmount;

    // Create a new payment document
    const payment = new Payment({
      client_id,
      work_id,
      amount,
      discount_percentage,
      total_bill,
      payment_date,
    });

    // Save the payment to the database
    await payment.save();

    res.status(201).json({
      message: 'Payment added successfully',
      payment,
    });
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

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
      work_description: work.work_description,
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

  console.log("Received works:", works);

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
          work_name: work.work_name || '',
          work_description: work.work_description || '',
          pending_documents: Array.isArray(work.pending_documents) && work.pending_documents.length > 0 ? true : false, // 👈 Fixed
          fee_estimation: work.fee_estimation !== undefined ? work.fee_estimation : 0,
          work_assigned_date: new Date(),
          due_date: work.due_date ? new Date(work.due_date) : null,
          status: (Array.isArray(work.pending_documents) && work.pending_documents.length > 0) ? "pending documents" : "in progress",
        }));
      }catch (err) {
        console.error("Error parsing works:", err);
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
  const { client_id, employee_id, work_description, pending_documents, work_assigned_date, due_date, fee_estimation } = req.body;

  try {
    const client = await Client.findOne({ _id: client_id });
    if (!client) {
      console.log("client not found");
      return res.status(404).json({ message: 'Client not found' });
    }

    const employee = await Employee.findOne({ _id: employee_id });
    if (!employee) {
      console.log("employee not found");
      return res.status(404).json({ message: 'Employee not found' });
    }

    const status = pending_documents ? 'pending documents' : 'in progress';

    const newWork = new Work({
      work_description,
      pending_documents,
      status,
      employeeId: employee._id,
      clientId: client._id,
      work_assigned_date: work_assigned_date, // Taken from frontend now
      due_date: due_date, // New field
      fee_estimation: fee_estimation, // New field
    });

    await newWork.save();

    res.status(201).json({
      message: 'Work added successfully',
      work: newWork,
    });
  } catch (error) {
    console.log(error.message);
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
  const { status, work_completed_date } = req.body;
  console.log('Incoming update:', status, work_completed_date);

  try {
    const work = await Work.findById(req.params.workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });

    // Update status if provided
    if (status) {
      work.status = status;
    }

    // Update completed date if provided
    if (work_completed_date) {
      work.work_completed_date = work_completed_date;
    }

    // If status is completed but no completed date provided, set it to current time
    if (work.status === 'completed' && !work.work_completed_date) {
      work.work_completed_date = work_completed_date; // <-- set today's date
    }

    const updatedWork = await work.save();

    res.status(200).json(updatedWork);
  } catch (err) {
    console.error('Error updating work:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
