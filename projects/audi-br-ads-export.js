/**
 * Google Ads Script — Audi Baton Rouge Performance Export
 * Exports campaign, ad group, and keyword data to Google Sheets
 *
 * HOW TO RUN:
 * 1. Go to Google Ads (ads.google.com) → Tools & Settings → Bulk Actions → Scripts
 * 2. Click the + button to create a new script
 * 3. Paste this entire script
 * 4. Click "Authorize" then "Run"
 * 5. Check your Google Drive for a new sheet called "Audi BR - Ads Report"
 */

function main() {
  var spreadsheet = SpreadsheetApp.create("Audi BR - Ads Report");
  var url = spreadsheet.getUrl();
  Logger.log("Report URL: " + url);

  var dateRange = "LAST_30_DAYS";

  // ── SHEET 1: Account Overview ──────────────────────────────────
  var overviewSheet = spreadsheet.getActiveSheet();
  overviewSheet.setName("Overview");
  overviewSheet.appendRow(["Audi Baton Rouge — Google Ads Report", "Last 30 Days", new Date()]);
  overviewSheet.appendRow([]);

  // Account-level metrics
  var accountQuery = "SELECT " +
    "metrics.impressions, " +
    "metrics.clicks, " +
    "metrics.cost_micros, " +
    "metrics.conversions, " +
    "metrics.ctr, " +
    "metrics.average_cpc, " +
    "metrics.cost_per_conversion " +
    "FROM customer " +
    "WHERE segments.date DURING " + dateRange;

  var accountReport = AdsApp.report(accountQuery);
  overviewSheet.appendRow(["ACCOUNT TOTALS", "", "", "", "", "", ""]);
  overviewSheet.appendRow(["Impressions", "Clicks", "Spend ($)", "Conversions", "CTR (%)", "Avg CPC ($)", "Cost/Conv ($)"]);

  var accountRows = accountReport.rows();
  while (accountRows.hasNext()) {
    var row = accountRows.next();
    overviewSheet.appendRow([
      parseInt(row["metrics.impressions"]),
      parseInt(row["metrics.clicks"]),
      (parseInt(row["metrics.cost_micros"]) / 1000000).toFixed(2),
      parseFloat(row["metrics.conversions"]).toFixed(1),
      (parseFloat(row["metrics.ctr"]) * 100).toFixed(2),
      (parseInt(row["metrics.average_cpc"]) / 1000000).toFixed(2),
      (parseInt(row["metrics.cost_per_conversion"]) / 1000000).toFixed(2),
    ]);
  }

  // ── SHEET 2: Campaigns ────────────────────────────────────────
  var campaignSheet = spreadsheet.insertSheet("Campaigns");
  campaignSheet.appendRow([
    "Campaign Name", "Status", "Type", "Budget ($/day)",
    "Impressions", "Clicks", "Spend ($)", "CTR (%)", "Avg CPC ($)",
    "Conversions", "Conv Rate (%)", "Cost/Conv ($)"
  ]);

  var campaignQuery = "SELECT " +
    "campaign.name, " +
    "campaign.status, " +
    "campaign.advertising_channel_type, " +
    "campaign_budget.amount_micros, " +
    "metrics.impressions, " +
    "metrics.clicks, " +
    "metrics.cost_micros, " +
    "metrics.ctr, " +
    "metrics.average_cpc, " +
    "metrics.conversions, " +
    "metrics.conversions_from_interactions_rate, " +
    "metrics.cost_per_conversion " +
    "FROM campaign " +
    "WHERE segments.date DURING " + dateRange + " " +
    "ORDER BY metrics.cost_micros DESC";

  var campaignReport = AdsApp.report(campaignQuery);
  var campaignRows = campaignReport.rows();
  while (campaignRows.hasNext()) {
    var row = campaignRows.next();
    campaignSheet.appendRow([
      row["campaign.name"],
      row["campaign.status"],
      row["campaign.advertising_channel_type"],
      (parseInt(row["campaign_budget.amount_micros"]) / 1000000).toFixed(2),
      parseInt(row["metrics.impressions"]),
      parseInt(row["metrics.clicks"]),
      (parseInt(row["metrics.cost_micros"]) / 1000000).toFixed(2),
      (parseFloat(row["metrics.ctr"]) * 100).toFixed(2),
      (parseInt(row["metrics.average_cpc"]) / 1000000).toFixed(2),
      parseFloat(row["metrics.conversions"]).toFixed(1),
      (parseFloat(row["metrics.conversions_from_interactions_rate"]) * 100).toFixed(2),
      (parseInt(row["metrics.cost_per_conversion"]) / 1000000).toFixed(2),
    ]);
  }

  // ── SHEET 3: Keywords ─────────────────────────────────────────
  var kwSheet = spreadsheet.insertSheet("Keywords");
  kwSheet.appendRow([
    "Campaign", "Ad Group", "Keyword", "Match Type", "Status",
    "Impressions", "Clicks", "Spend ($)", "CTR (%)", "Avg CPC ($)",
    "Conversions", "Quality Score", "Avg Position"
  ]);

  var kwQuery = "SELECT " +
    "campaign.name, " +
    "ad_group.name, " +
    "ad_group_criterion.keyword.text, " +
    "ad_group_criterion.keyword.match_type, " +
    "ad_group_criterion.status, " +
    "metrics.impressions, " +
    "metrics.clicks, " +
    "metrics.cost_micros, " +
    "metrics.ctr, " +
    "metrics.average_cpc, " +
    "metrics.conversions, " +
    "ad_group_criterion.quality_info.quality_score " +
    "FROM keyword_view " +
    "WHERE segments.date DURING " + dateRange + " " +
    "AND metrics.impressions > 0 " +
    "ORDER BY metrics.cost_micros DESC " +
    "LIMIT 200";

  var kwReport = AdsApp.report(kwQuery);
  var kwRows = kwReport.rows();
  while (kwRows.hasNext()) {
    var row = kwRows.next();
    kwSheet.appendRow([
      row["campaign.name"],
      row["ad_group.name"],
      row["ad_group_criterion.keyword.text"],
      row["ad_group_criterion.keyword.match_type"],
      row["ad_group_criterion.status"],
      parseInt(row["metrics.impressions"]),
      parseInt(row["metrics.clicks"]),
      (parseInt(row["metrics.cost_micros"]) / 1000000).toFixed(2),
      (parseFloat(row["metrics.ctr"]) * 100).toFixed(2),
      (parseInt(row["metrics.average_cpc"]) / 1000000).toFixed(2),
      parseFloat(row["metrics.conversions"]).toFixed(1),
      row["ad_group_criterion.quality_info.quality_score"] || "N/A",
    ]);
  }

  // ── SHEET 4: Search Terms ─────────────────────────────────────
  var stSheet = spreadsheet.insertSheet("Search Terms");
  stSheet.appendRow([
    "Campaign", "Ad Group", "Search Term", "Match Type",
    "Impressions", "Clicks", "Spend ($)", "CTR (%)", "Avg CPC ($)", "Conversions"
  ]);

  var stQuery = "SELECT " +
    "campaign.name, " +
    "ad_group.name, " +
    "search_term_view.search_term, " +
    "search_term_view.status, " +
    "metrics.impressions, " +
    "metrics.clicks, " +
    "metrics.cost_micros, " +
    "metrics.ctr, " +
    "metrics.average_cpc, " +
    "metrics.conversions " +
    "FROM search_term_view " +
    "WHERE segments.date DURING " + dateRange + " " +
    "AND metrics.impressions > 5 " +
    "ORDER BY metrics.cost_micros DESC " +
    "LIMIT 200";

  var stReport = AdsApp.report(stQuery);
  var stRows = stReport.rows();
  while (stRows.hasNext()) {
    var row = stRows.next();
    stSheet.appendRow([
      row["campaign.name"],
      row["ad_group.name"],
      row["search_term_view.search_term"],
      row["search_term_view.status"],
      parseInt(row["metrics.impressions"]),
      parseInt(row["metrics.clicks"]),
      (parseInt(row["metrics.cost_micros"]) / 1000000).toFixed(2),
      (parseFloat(row["metrics.ctr"]) * 100).toFixed(2),
      (parseInt(row["metrics.average_cpc"]) / 1000000).toFixed(2),
      parseFloat(row["metrics.conversions"]).toFixed(1),
    ]);
  }

  // ── SHEET 5: Conversions ──────────────────────────────────────
  var convSheet = spreadsheet.insertSheet("Conversions");
  convSheet.appendRow(["Conversion Action", "Conversions", "All Conversions", "Value"]);

  var convQuery = "SELECT " +
    "conversion_action.name, " +
    "metrics.conversions, " +
    "metrics.all_conversions, " +
    "metrics.conversions_value " +
    "FROM conversion_action " +
    "WHERE segments.date DURING " + dateRange;

  var convReport = AdsApp.report(convQuery);
  var convRows = convReport.rows();
  while (convRows.hasNext()) {
    var row = convRows.next();
    convSheet.appendRow([
      row["conversion_action.name"],
      parseFloat(row["metrics.conversions"]).toFixed(1),
      parseFloat(row["metrics.all_conversions"]).toFixed(1),
      parseFloat(row["metrics.conversions_value"]).toFixed(2),
    ]);
  }

  Logger.log("✅ Report complete! Open here: " + url);
}
