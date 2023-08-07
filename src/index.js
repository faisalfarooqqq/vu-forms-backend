const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors'); // Import cors middleware
const nodemailer = require('nodemailer');

const app = express();
const PORT = 5000; // Change this to your desired port number

// PostgreSQL database connection

const pool = new Pool({
    connectionString: 'postgres://ndctjfwl:qr5UOBwc8f_A1iwiTu0EeiG5U3ep9saX@drona.db.elephantsql.com/ndctjfwl',
    ssl: {
      rejectUnauthorized: false
    }
  });

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Replace with your SMTP host
    port: 587, // Replace with your SMTP port
    secure: false, // Set to true if your SMTP provider supports SSL/TLS
    auth: {
      user: 'faisal.18.1993@gmail.com', // Replace with your email address
      pass: 'hauluehuuhmtfvxx', // Replace with your email password
    },
  });

app.use(cors()); // Enable CORS for all routes

app.use(bodyParser.json());

// Middleware function to check if the user is authenticated
function authenticateToken(req, res, next) {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }

  jwt.verify(token, 'your_secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token.' });
    }

    req.user = user;
    next();
  });
}

app.post('/emailForm/:formId', async (req, res) => {
  const { formId } = req.params;
  const { recipientEmail } = req.body;

  try {
    // Construct the link to the form
    const formLink = `https://lambent-dodol-73afe5.netlify.app/fillform/${formId}`;

    // Send the email using nodemailer
    await transporter.sendMail({
      from: 'faisal.18.1993@gmail.com',
      to: recipientEmail,
      subject: 'Invitation to fill out a form',
      html: `
        <p>You have been invited to fill out a form.</p>
        <p>Click on the link below to access the form:</p>
        <a href="${formLink}">Click Here to open form</a>
      `,
    });

    return res.status(200).json({ message: 'Email sent successfully.', recipientEmail });
  } catch (error) {
    console.error('Error while sending email:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route to register a new user
app.post('/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    console.log(req.body);
    try {
      // Check if the user already exists in the database
      const userQuery = 'SELECT * FROM users WHERE email = $1';
      const existingUser = await pool.query(userQuery, [email]);
  
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ message: 'User already exists.' });
      }
  
      // Hash the password before storing it
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Insert the new user into the database
      const insertUserQuery = 'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING *';
      const newUser = await pool.query(insertUserQuery, [full_name, email, hashedPassword]);
  
      return res.status(201).json({ message: 'User registered successfully.', user: newUser.rows[0] });
    } catch (error) {
      console.error('Error during user registration:', error);
      return res.status(500).json({ message: 'Internal server error.' });
    }
  });

// Route to log in a user
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if the user exists in the database
    const userQuery = 'SELECT * FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = userResult.rows[0];

    // Compare the provided password with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate a JWT token and send it to the client for future authenticated requests
    const token = jwt.sign({ id: user.id, email: user.email }, 'your_secret_key', {
      expiresIn: '1h',
    });

    return res.status(200).json({ message: 'Login successful.',  token });
  } catch (error) {
    console.error('Error during user login:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});
app.post('/logout', (req, res) => {
  // Get the token from the request headers
  const token = req.headers.authorization;

  if (!token) {
    // If the token is not present in the headers, the user is not authenticated
    return res.status(401).json({ message: 'User not authenticated.' });
  }

  try {
    
    return res.json({ message: 'Logout successful.' });
  } catch (error) {
    console.error('Error during logout:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/forms', async (req, res) => {
  try {
    // Fetch all forms from the database
    const query = 'SELECT * FROM forms';
    const result = await pool.query(query);

    // Return the list of forms as JSON
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error while fetching forms:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/forms/:formId', async (req, res) => {
  const { formId } = req.params;
  try {
    // Fetch form data
    const formDataQuery = `
      SELECT
        title,
        description
      FROM forms
      WHERE id = $1;
    `;
    const formDataResult = await pool.query(formDataQuery, [formId]);
    if (formDataResult.rows.length === 0) {
      return res.status(404).json({ message: 'Form not found.' });
    }

    const formData = formDataResult.rows[0];

    // Fetch questions for the form along with their options
    const questionsQuery = `
      SELECT
        q.id AS question_id,
        q.question_text,
        q.question_type,
        json_agg(o.option_text) AS options
      FROM questions q
      LEFT JOIN options o ON q.id = o.question_id
      WHERE form_id = $1
      GROUP BY q.id;
    `;
    const questionsResult = await pool.query(questionsQuery, [formId]);

    // Add questions to the formData object
    formData.questions = questionsResult.rows;

    return res.status(200).json(formData);
  } catch (error) {
    console.error('Error while fetching form data:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/responses/:formId', async (req, res) => {
  const { formId } = req.params;
  console.log('here');
  try {
    // Fetch form responses
    const formResponsesQuery = `
      SELECT
        fr.id,
        fr.email,
        fr.submitted_at,
        json_agg(
          json_build_object(
            'question_id', qr.question_id,
            'response', qr.answer_text
          )
        ) AS answers
      FROM form_responses fr
      LEFT JOIN question_responses qr ON fr.id = qr.response_id
      WHERE fr.form_id = $1
      GROUP BY fr.id;
    `;
    const formResponsesResult = await pool.query(formResponsesQuery, [formId]);
    if (formResponsesResult.rows.length === 0) {
      return res.status(404).json({ message: 'Responses not found for the form.' });
    }

    const formResponses = formResponsesResult.rows;

    for (const response of formResponses) {
  for (const answer of response.answers) {
    const questionId = answer.question_id;
    const questionQuery = 'SELECT question_text FROM questions WHERE id = $1';
    const questionResult = await pool.query(questionQuery, [questionId]);
    if (questionResult.rows.length > 0) {
      answer.question_text = questionResult.rows[0].question_text;
    }
  }
}

    return res.status(200).json(formResponses);
  } catch (error) {
    console.error('Error while fetching form responses:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


app.post('/forms', async (req, res) => {
  const { user_id, title, description, questions } = req.body;
  console.log(req.body);

  try {
    // Insert the new form into the forms table
    const insertFormQuery = 'INSERT INTO forms (user_id, title, description) VALUES ($1, $2, $3) RETURNING *';
    const newForm = await pool.query(insertFormQuery, [user_id, title, description]);

    const formId = newForm.rows[0].id;

    // Insert the questions and options into the database
    for (const question of questions) {
      const { question_text, question_type, options } = question;

      // Insert the new question into the questions table
      const insertQuestionQuery = 'INSERT INTO questions (form_id, question_text, question_type) VALUES ($1, $2, $3) RETURNING *';
      const newQuestion = await pool.query(insertQuestionQuery, [formId, question_text, question_type]);

      const questionId = newQuestion.rows[0].id;

      // If the question has options (for radio and checkbox questions), insert the options into the options table
      if (question_type === 'radio' || question_type === 'checkbox') {
        for (const option of options) {
          const insertOptionQuery = 'INSERT INTO options (question_id, option_text) VALUES ($1, $2) RETURNING *';
          await pool.query(insertOptionQuery, [questionId, option]);
        }
      }
    }

    return res.status(201).json({ message: 'Form created successfully.', formId });
  } catch (error) {
    console.error('Error while creating form:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/submitForm/:formId', async (req, res) => {
  const { formId } = req.params;
  const { email, answers } = req.body;
  console.log(req.body);
  try {
    // First, check if the form exists
    const checkFormQuery = 'SELECT * FROM forms WHERE id = $1';
    const checkFormResult = await pool.query(checkFormQuery, [formId]);

    if (checkFormResult.rows.length === 0) {
      return res.status(404).json({ message: 'Form not found.' });
    }

    // Next, validate the request data
    if (!email || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Invalid request data.' });
    }

    // Start a transaction to ensure data consistency
    const client = await pool.connect();
    try {
      // Save the response to the form_responses table
      const insertResponseQuery = `
        INSERT INTO form_responses (form_id, email)
        VALUES ($1, $2)
        RETURNING id;
      `;
      const insertResponseResult = await client.query(insertResponseQuery, [formId, email]);

      const responseId = insertResponseResult.rows[0].id;

      // Save the answers to the question_responses table
      for (const answer of answers) {
        const { question_id, response } = answer;
        const insertAnswerQuery = `
          INSERT INTO question_responses (response_id, question_id, answer_text)
          VALUES ($1, $2, $3);
        `;
        await client.query(insertAnswerQuery, [responseId, question_id, response.answer]);
      }

      // Commit the transaction
      await client.query('COMMIT');

      return res.status(201).json({ message: 'Form submitted successfully.', responseId });
    } catch (error) {
      // Rollback the transaction in case of an error
      await client.query('ROLLBACK');
      console.error('Error while submitting form:', error);
      return res.status(500).json({ message: 'Internal server error.' });
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (error) {
    console.error('Error while submitting form:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


  app.post('/logout', (req, res) => {
  // Get the token from the request headers
  const token = req.headers.authorization;

  if (!token) {
    // If the token is not present in the headers, the user is not authenticated
    return res.status(401).json({ message: 'User not authenticated.' });
  }

  try {
    
    return res.json({ message: 'Logout successful.' });
  } catch (error) {
    console.error('Error during logout:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
