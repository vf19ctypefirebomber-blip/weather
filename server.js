require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

app.use(express.static(path.join(__dirname, 'public')));

function buildParams(query) {
  const { q, lat, lon, units = 'metric', lang = 'ja' } = query;
  const params = { appid: API_KEY, units, lang };
  if (q) params.q = q;
  if (lat && lon) { params.lat = lat; params.lon = lon; }
  return params;
}

app.get('/api/weather', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/weather`, { params: buildParams(req.query) });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'サーバーエラーが発生しました';
    res.status(status).json({ error: message });
  }
});

app.get('/api/forecast', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/forecast`, { params: buildParams(req.query) });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'サーバーエラーが発生しました';
    res.status(status).json({ error: message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`サーバー起動: http://localhost:${PORT}`);
  });
}

module.exports = app;
