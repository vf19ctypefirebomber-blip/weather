let currentUnit = 'metric';
let lastQuery = null;
let currentWeatherData = null;
let forecastData = null;
let selectedDayKey = null;
let searchHistory = JSON.parse(localStorage.getItem('weatherHistory') || '[]');

const cityInput     = document.getElementById('city-input');
const searchBtn     = document.getElementById('search-btn');
const locationBtn   = document.getElementById('location-btn');
const unitBtn       = document.getElementById('unit-btn');
const errorMsg      = document.getElementById('error-msg');
const loadingEl     = document.getElementById('loading');
const weatherResult = document.getElementById('weather-result');
const historyTags   = document.getElementById('history-tags');

searchBtn.addEventListener('click', () => {
  const q = cityInput.value.trim();
  if (q) fetchWeather({ q });
});

cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = cityInput.value.trim();
    if (q) fetchWeather({ q });
  }
});

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('お使いのブラウザは現在地取得に対応していません');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => showError('現在地の取得に失敗しました。ブラウザの位置情報を許可してください')
  );
});

unitBtn.addEventListener('click', () => {
  currentUnit = currentUnit === 'metric' ? 'imperial' : 'metric';
  unitBtn.textContent = currentUnit === 'metric' ? '°F に切替' : '°C に切替';
  if (lastQuery) fetchWeather(lastQuery);
});

historyTags.addEventListener('click', (e) => {
  const tag = e.target.closest('.history-tag');
  if (tag) fetchWeather({ q: tag.dataset.city });
});

document.getElementById('forecast').addEventListener('click', (e) => {
  const card = e.target.closest('.forecast-card');
  if (!card) return;
  const key = card.dataset.key;
  if (selectedDayKey === key) {
    closeForecastDetail();
  } else {
    selectForecastDay(key);
  }
});

document.getElementById('current-weather').addEventListener('click', (e) => {
  if (e.target.closest('#detail-back')) closeForecastDetail();
});

renderHistory();

// ── API ──

async function fetchWeather(query) {
  lastQuery = query;
  showLoading(true);
  hideError();

  const params = new URLSearchParams({ units: currentUnit, lang: 'ja' });
  if (query.q)        params.set('q', query.q);
  if (query.lat != null) { params.set('lat', query.lat); params.set('lon', query.lon); }

  try {
    const [weatherRes, forecastRes] = await Promise.all([
      fetch(`/api/weather?${params}`),
      fetch(`/api/forecast?${params}`)
    ]);

    if (!weatherRes.ok) {
      const err = await weatherRes.json();
      throw new Error(err.error || '都市が見つかりませんでした');
    }

    const [weather, forecast] = await Promise.all([weatherRes.json(), forecastRes.json()]);

    renderCurrentWeather(weather);
    renderForecast(forecast);

    if (selectedDayKey) {
      const daily = groupByDay(forecast.list);
      if (daily[selectedDayKey]) renderForecastDetail(selectedDayKey);
      else closeForecastDetail();
    }

    weatherResult.classList.remove('hidden');
    addToHistory(weather.name);
  } catch (err) {
    showError(err.message);
    weatherResult.classList.add('hidden');
  } finally {
    showLoading(false);
  }
}

// ── Render: Current Weather ──

function renderCurrentWeather(data) {
  currentWeatherData = data;
  const unit     = currentUnit === 'metric' ? '°C' : '°F';
  const windUnit = currentUnit === 'metric' ? 'm/s' : 'mph';
  const iconUrl  = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
  const localTime = new Date((data.dt + data.timezone) * 1000)
    .toUTCString().replace(' GMT', '').split(' ').slice(1).join(' ');

  document.getElementById('current-weather').innerHTML = `
    <div class="weather-card">
      <div class="city-name">${escape(data.name)}, ${escape(data.sys.country)}</div>
      <div class="local-time">${localTime}</div>
      <div class="weather-main">
        <img src="${iconUrl}" alt="${escape(data.weather[0].description)}" class="weather-icon" />
        <div class="temperature">${Math.round(data.main.temp)}${unit}</div>
      </div>
      <div class="description">${escape(data.weather[0].description)}</div>
      <div class="details">
        <div class="detail-item">
          <span class="label">体感温度</span>
          <span class="value">${Math.round(data.main.feels_like)}${unit}</span>
        </div>
        <div class="detail-item">
          <span class="label">湿度</span>
          <span class="value">${data.main.humidity}%</span>
        </div>
        <div class="detail-item">
          <span class="label">風速</span>
          <span class="value">${data.wind.speed} ${windUnit}</span>
        </div>
        <div class="detail-item">
          <span class="label">気圧</span>
          <span class="value">${data.main.pressure} hPa</span>
        </div>
      </div>
    </div>
  `;
}

// ── Render: Forecast Grid ──

function renderForecast(data) {
  forecastData = data;
  const unit  = currentUnit === 'metric' ? '°C' : '°F';
  const daily = groupByDay(data.list);
  const days  = Object.entries(daily).slice(0, 5);

  const cards = days.map(([dateKey, { date, items }]) => {
    const maxTemp = Math.max(...items.map(i => i.main.temp_max));
    const minTemp = Math.min(...items.map(i => i.main.temp_min));
    const noon    = closestToNoon(items);
    const dateStr = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const iconUrl = `https://openweathermap.org/img/wn/${noon.weather[0].icon}.png`;

    return `
      <div class="forecast-card${selectedDayKey === dateKey ? ' selected' : ''}" data-key="${dateKey}">
        <div class="forecast-date">${dateStr}</div>
        <img src="${iconUrl}" alt="${escape(noon.weather[0].description)}" />
        <div class="forecast-desc">${escape(noon.weather[0].description)}</div>
        <div class="forecast-temp">
          <span class="temp-max">${Math.round(maxTemp)}${unit}</span>
          <span class="temp-min">${Math.round(minTemp)}${unit}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('forecast').innerHTML = `
    <h2 class="section-title">5日間の予報 <span class="section-hint">— 日付をクリックで詳細表示</span></h2>
    <div class="forecast-grid">${cards}</div>
  `;
}

// ── Forecast Detail ──

function selectForecastDay(key) {
  selectedDayKey = key;
  document.querySelectorAll('.forecast-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.key === key);
  });
  renderForecastDetail(key);
}

function closeForecastDetail() {
  selectedDayKey = null;
  document.querySelectorAll('.forecast-card').forEach(c => c.classList.remove('selected'));
  if (currentWeatherData) renderCurrentWeather(currentWeatherData);
}

function renderForecastDetail(dateKey) {
  if (!forecastData) return;
  const daily   = groupByDay(forecastData.list);
  const dayData = daily[dateKey];
  if (!dayData) return;

  const unit     = currentUnit === 'metric' ? '°C' : '°F';
  const windUnit = currentUnit === 'metric' ? 'm/s' : 'mph';
  const tz       = forecastData.city.timezone;

  const maxTemp = Math.max(...dayData.items.map(i => i.main.temp_max));
  const minTemp = Math.min(...dayData.items.map(i => i.main.temp_min));
  const noon    = closestToNoon(dayData.items);
  const iconUrl = `https://openweathermap.org/img/wn/${noon.weather[0].icon}@2x.png`;

  const [year, month, day] = dateKey.split('-').map(Number);
  const dateStr = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC'
  });

  const hourlyHTML = dayData.items.map(item => {
    const localDate = new Date((item.dt + tz) * 1000);
    const timeStr   = `${String(localDate.getUTCHours()).padStart(2, '0')}:00`;
    const icon      = `https://openweathermap.org/img/wn/${item.weather[0].icon}.png`;
    const pop       = Math.round((item.pop || 0) * 100);
    return `
      <div class="hourly-item">
        <div class="hourly-time">${timeStr}</div>
        <img src="${icon}" alt="" width="40" height="40" />
        <div class="hourly-temp">${Math.round(item.main.temp)}${unit}</div>
        <div class="hourly-pop${pop > 0 ? ' has-rain' : ''}">${pop > 0 ? `${pop}%` : '—'}</div>
      </div>
    `;
  }).join('');

  document.getElementById('current-weather').innerHTML = `
    <div class="weather-card">
      <div class="detail-header">
        <button class="detail-back" id="detail-back">← 今日の天気</button>
        <div class="detail-date">${dateStr}</div>
      </div>
      <div class="weather-main">
        <img src="${iconUrl}" alt="${escape(noon.weather[0].description)}" class="weather-icon" />
        <div class="temperature">${Math.round(noon.main.temp)}${unit}</div>
      </div>
      <div class="description">${escape(noon.weather[0].description)}</div>
      <div class="details">
        <div class="detail-item">
          <span class="label">最高気温</span>
          <span class="value">${Math.round(maxTemp)}${unit}</span>
        </div>
        <div class="detail-item">
          <span class="label">最低気温</span>
          <span class="value">${Math.round(minTemp)}${unit}</span>
        </div>
        <div class="detail-item">
          <span class="label">体感温度</span>
          <span class="value">${Math.round(noon.main.feels_like)}${unit}</span>
        </div>
        <div class="detail-item">
          <span class="label">湿度</span>
          <span class="value">${noon.main.humidity}%</span>
        </div>
        <div class="detail-item">
          <span class="label">風速</span>
          <span class="value">${noon.wind.speed} ${windUnit}</span>
        </div>
        <div class="detail-item">
          <span class="label">気圧</span>
          <span class="value">${noon.main.pressure} hPa</span>
        </div>
      </div>
      <div class="hourly-section">
        <div class="section-title">時間別予報</div>
        <div class="hourly-grid">${hourlyHTML}</div>
      </div>
    </div>
  `;
}

// ── Helpers ──

function groupByDay(list) {
  return list.reduce((acc, item) => {
    const key = new Date(item.dt * 1000).toISOString().split('T')[0];
    if (!acc[key]) acc[key] = { date: new Date(item.dt * 1000), items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});
}

function closestToNoon(items) {
  return items.reduce((best, item) => {
    const h     = new Date(item.dt * 1000).getHours();
    const bestH = new Date(best.dt * 1000).getHours();
    return Math.abs(h - 12) < Math.abs(bestH - 12) ? item : best;
  });
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── History ──

function addToHistory(city) {
  searchHistory = [city, ...searchHistory.filter(c => c !== city)].slice(0, 5);
  localStorage.setItem('weatherHistory', JSON.stringify(searchHistory));
  renderHistory();
}

function renderHistory() {
  historyTags.innerHTML = searchHistory
    .map(city => `<button class="history-tag" data-city="${escape(city)}">${escape(city)}</button>`)
    .join('');
}

// ── UI State ──

function showLoading(show) { loadingEl.classList.toggle('hidden', !show); }
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function hideError() { errorMsg.classList.add('hidden'); }
