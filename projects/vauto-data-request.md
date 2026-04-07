# Email to Dwayne Hearl — Vauto Data Request

---

**Subject:** Custom Weekly Inventory Data Export — Need Your Help Building Our Reporting System

Hi Dwayne,

I'm building an internal reporting system to give our dealership clients real-time visibility into their inventory performance and market positioning. I need your help setting up automated weekly data exports from Vauto that feed into this system.

Here's what I need:

## Weekly Data Export (Every Friday, 5 PM Central)

**Format:** CSV file, emailed to lance@thecoopbrla.com with subject line `"Vauto Data Export - [Week of MM/DD]"`

**Data points needed (by dealership, by week):**

### Inventory Health
- **Total vehicles in stock**
- **Vehicles by age bucket:** 0-30 days, 31-60 days, 61-90 days, 90+ days
- **Average days on market** (by dealership)
- **Vehicles over 60 days** (count + list of VINs/models if possible)

### Pricing & Market Data
- **Average asking price** (by dealership)
- **Average market price** (Vauto's market comparison)
- **Price delta** (our price vs. market avg — positive or negative %)
- **Vehicles priced above/below market** (count + percentage)

### Traffic & Engagement
- **Total page views** (if Vauto tracks this)
- **Average views per vehicle**
- **Vehicles with low traffic** (below dealership average)

### Market Insights
- **Days to sell benchmark** (your dealership vs. market)
- **Turn rate** (vehicles sold / total inventory)
- **Vehicles at risk** (high age + low traffic + above-market pricing)

## Data Structure

**Columns in the CSV (in this order):**
```
Date_Range | Dealership | Total_Inventory | Days_0_30 | Days_31_60 | Days_61_90 | 
Days_90_Plus | Avg_Days_On_Market | Avg_Asking_Price | Avg_Market_Price | Price_Delta_Percent |
Above_Market_Count | Below_Market_Count | Vehicles_Over_60_Days | Page_Views_Total | 
Avg_Views_Per_Vehicle | Days_To_Sell_vs_Market | Turn_Rate_Percent
```

**Example row:**
```
"Week of 3/31/2026" | "Brian Harris BMW" | 127 | 45 | 28 | 18 | 36 | 42 | $38,500 | 
$37,200 | +3.5% | 22 | 89 | 54 | 3,240 | 25.6 | 8 days vs 6 market | 15%
```

## Dealerships to Include
1. Brian Harris BMW
2. Audi Baton Rouge
3. Harris Porsche

## Timeline
- Can you set this up to run automatically every Friday at 5 PM?
- First export: **Friday, April 4, 2026**
- Then every Friday thereafter

## Questions for You
1. Which of these data points are available in Vauto's standard reporting?
2. Can you automate the export + email, or do you need me to request it manually each week?
3. Do you have the exact dealership account names/IDs so we pull from the right accounts?
4. Can Vauto flag vehicles that are "at risk" (aging + below-market traffic)? That would be super useful.

Let me know what's feasible and we'll work from there. This is going to help us identify inventory problems fast and optimize pricing + marketing for each vehicle.

Thanks,
Lance

---

**P.S.** If there's additional inventory data Vauto tracks that might be useful (model-specific trends, seasonality, competitive gaps, etc.), include that too. Better to have it than not.
