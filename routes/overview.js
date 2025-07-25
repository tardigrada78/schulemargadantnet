import { Router } from "express";
const router = Router();
import yf from "yahoo-finance2";
import moment from "moment";

// My stocks [Index, Value (US$), Date, Amount]
const myStocks = [
  ["GOOGL", 123.25, moment("9.2.22", "D.M.YY"), 15],
  ["NVDA", 119.48, moment("9.10.24", "D.M.YY"), 10],
  ["AMD", 139.39, moment("19.11.24", "D.M.YY"), 40],
  ["INTC", 20.42, moment("3.1.25", "D.M.YY"), 150],
];

// Function to get stock values from yahoo
async function getStockData() {
  let myTotal = 0;
  const stockData = [];
  for (const i of myStocks) {
    try {
      const ticker = i[0];
      const queryOptions = { period1: moment().subtract(1, "days").toDate(), period2: new Date() };
      const latestData = await yf.historical(ticker, queryOptions);
      if (latestData && latestData.length > 0) {
        const latestPrice = latestData[latestData.length - 1].close;
        const latestDate = moment(latestData[latestData.length - 1].date);
        const formattedDate = latestDate.format("D.M.YY HH:mm");
        const actualDate = i[2].format("D.M.YY HH:mm");
        const diff = i[3] * (latestPrice - i[1]);
        myTotal += diff;
        const percentage = (latestPrice / i[1] - 1) * 100;
        stockData.push({
          ticker: i[0],
          actualDate: actualDate,
          formattedDate: formattedDate,
          amount: i[3],
          purchasePrice: i[1],
          latestPrice: latestPrice.toFixed(2),
          profit: `<strong>${diff.toFixed(2)}</strong>`,
          percentage: `<strong>${percentage.toFixed(0)}</strong>`,
        });
      } else {
        console.log(`Keine aktuellen Daten verfügbar für ${i[0]}.`);
        stockData.push({
          ticker: i[0],
          error: "Keine aktuellen Daten verfügbar.",
        });
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Daten für ${i[0]}:`, error);
      stockData.push({
        ticker: i[0],
        error: `Fehler beim Abrufen der Daten: ${error.message}`,
      });
    }
  }
  return { totalProfit: `<strong>${myTotal.toFixed(2)}</strong>`, stocks: stockData };
}

// API endpoint to get stock data
router.get("/stockdata", async (req, res) => {
  try {
    const data = await getStockData();
    res.json(data);
  } catch (error) {
    console.error("Error in /stockdata:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
