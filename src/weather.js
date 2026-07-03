const FALLBACK = {
  condition: "Clear",
  icon: "01d",
  tempCelsius: 28,
  windSpeedKmh: 12,
  visibility: 10000,
  humidity: 55,
  riskLevel: "low",
};

function computeWeatherRisk(windSpeedKmh, visibility) {
  if (windSpeedKmh > 40 || visibility < 3000) return "high";
  if (windSpeedKmh > 20 || visibility < 5000) return "medium";
  return "low";
}

async function fetchWeather(lat, lng) {
  const key = process.env.OPENWEATHERMAP_API_KEY;
  if (!key) return FALLBACK;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=metric`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return FALLBACK;

    const data = await resp.json();
    const windSpeedKmh = Math.round((data.wind?.speed ?? 0) * 3.6);
    const visibility = data.visibility ?? 10000;
    const tempCelsius = Math.round(data.main?.temp ?? 28);
    const condition = data.weather?.[0]?.main ?? "Clear";
    const icon = data.weather?.[0]?.icon ?? "01d";
    const humidity = data.main?.humidity ?? 55;
    const riskLevel = computeWeatherRisk(windSpeedKmh, visibility);

    return { condition, icon, tempCelsius, windSpeedKmh, visibility, humidity, riskLevel };
  } catch {
    return FALLBACK;
  }
}

module.exports = { fetchWeather, computeWeatherRisk, FALLBACK };
