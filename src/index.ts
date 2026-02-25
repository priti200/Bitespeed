import express from 'express';
import { handleIdentify } from './identify';

const app = express();
app.use(express.json());

app.post('/identify', (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    const result = handleIdentify(email, phoneNumber);
    res.json({ contact: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});