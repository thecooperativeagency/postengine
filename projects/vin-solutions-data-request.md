# Email to Dwayne Hearl — VinSolutions Data Request

---

**Subject:** Custom Weekly Data Export — Need Your Help Building Our Reporting System

Hi Dwayne,

I'm building an internal reporting system to give our dealership clients real-time visibility into their marketing performance. I need your help setting up automated weekly data exports from VinSolutions that feed into this system.

Here's what I need:

## Weekly Data Export (Every Friday, 5 PM Central)

**Format:** CSV file, emailed to lance@thecoopbrla.com with subject line `"VIN Data Export - [Week of MM/DD]"`

**Data points needed (by dealership, by week):**

### Leads & Conversions
- **Total leads** (form submissions + phone leads captured in VIN)
- **Leads by source** (if available): Website form, phone, chat, etc.
- **Lead status breakdown:** New, contacted, quoted, sold, lost
- **Conversion rate** (leads that became sales, if tracked in VIN)

### Campaigns (if available in your reporting)
- **Campaign name**
- **Leads generated per campaign**
- **Cost per campaign** (if VIN tracks ad spend integration)
- **Conversions per campaign**

### Sales Data
- **Total vehicles sold** (this week)
- **Gross profit** (total for the week)
- **Average gross per unit**

### Customer Interactions (if available)
- **Email sends** (automated campaigns)
- **Email opens**
- **SMS sends** (if you have SMS module)
- **Phone calls** (inbound volume, if tracked)

## Data Structure

**Columns in the CSV (in this order):**
```
Date_Range | Dealership | Total_Leads | Leads_Website | Leads_Phone | Leads_Chat | 
New_Leads | Contacted | Quoted | Sold | Lost | Email_Sends | Email_Opens | 
SMS_Sends | Phone_Calls | Vehicles_Sold | Gross_Profit | Avg_Gross_Per_Unit
```

**Example row:**
```
"Week of 3/31/2026" | "BMW Jackson" | 28 | 15 | 10 | 3 | 28 | 22 | 5 | 2 | 1 | 
120 | 45 | 35 | 42 | 8 | $12,400 | $1,550
```

## Dealerships to Include
1. BMW of Jackson
2. Audi Baton Rouge  
3. Lexus (TBD location)
4. Harris Porsche (TBD location)

## Timeline
- Can you set this up to run automatically every Friday at 5 PM?
- First export: **Friday, April 4, 2026**
- Then every Friday thereafter

## Questions for You
1. Which of these data points are available in VIN's standard reporting?
2. Can you automate the export + email, or do you need me to request it manually each week?
3. Do you need any custom fields set up in VIN to capture this data?
4. Can you confirm the dealership account names/IDs so we make sure we're pulling from the right accounts?

Let me know what's feasible and we'll work from there. This is going to help us optimize faster and give our GMs transparency they're not getting anywhere else.

Thanks,
Lance

---

**P.S.** If there's additional data VIN tracks that might be useful (inventory aging, video views, review responses, etc.), include that too. Better to have it than not.
