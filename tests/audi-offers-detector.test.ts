import { test } from "node:test";
import * as assert from "node:assert/strict";

import { parseAudiOffers } from "../server/audi-offers-detector";

const SAMPLE_MARKDOWN = `
## Featured offers

#### 2025 Audi Q5 quattro

### $3,000 Audi Credit

Receive a $3,000 customer bonus when you purchase or lease a select, new 2025 Audi Q5 quattro. Cannot be combined with Special lease or APR rates*

Offer ends June 1, 2026

Bonus Offer

![Image 1: Featured offer USA banner image](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/all-new-q5-premium-plus/2025_GUBAAY_Premium_Plus_F3.png)

#### 2026 Audi Q3 quattro

#### $529

*Monthly payment

#### 36

Months

#### $4,849

Due at Signing

Excludes tax, title, license, options, and dealer fees. $0 security deposit. For highly qualified customers. Optional features increase price.

Offer ends June 1, 2026

Lease Offer

![Image 2: Featured offer USA banner image](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2026/q3/base/2026_FJBABY_Base_F5.png)

![Image 7: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/all-new-q5-premium-plus/2025_GUBAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### $1,500 Loyalty Bonus

Current Audi owners can receive a $1,500 customer bonus when you purchase or lease a select, new 2025 Audi Q5 quattro.*Offer ends 06/01/2026.

Offer ends June 1, 2026

*View offer details

![Image 8: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/q5-sb/2025_GUNAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### $1,500 Loyalty Bonus

Current Audi owners can receive a $1,500 customer bonus when you purchase or lease a select, new 2025 Audi Q5 Sportback 45 TFSI.*Offer ends 06/01/2026.

Offer ends June 1, 2026

*View offer details

![Image 9: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/q5-sb/2025_GUNAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### $1,500 Audi Credit

Receive a $1,500 customer bonus when you purchase or lease a select, new 2025 Audi Q5 Sportback 45 TFSI. Cannot be combined with Special lease or APR rates*

Offer ends June 1, 2026

*View offer details

![Image 10: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/all-new-q5-premium-plus/2025_GUBAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### 3.99%

*APR

#### 72

Months

For highly qualified customers.

Offer ends June 1, 2026

*View offer details

![Image 11: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/q5-sb/2025_GUNAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### 3.99%

*APR

#### 72

Months

For highly qualified customers.

Offer ends June 1, 2026

*View offer details
`;

test("parseAudiOffers classifies featured, bonus, and APR cards correctly", () => {
  const offers = parseAudiOffers(SAMPLE_MARKDOWN);
  const titles = offers.map((offer) => offer.offerTitle);

  assert.equal(offers.length, 7);
  assert.ok(titles.includes("2026 Audi Q3 quattro Lease $529 / 36 months"));
  assert.ok(titles.includes("2025 Audi Q5 quattro $3,000 Audi Credit"));
  assert.ok(titles.includes("2025 Audi Q5 quattro Finance 3.99% APR for 72 months"));
  assert.ok(titles.includes("2025 Audi Q5 Sportback 45 TFSI Finance 3.99% APR for 72 months"));

  const audiCredit = offers.find((offer) => offer.offerTitle === "2025 Audi Q5 quattro $3,000 Audi Credit");
  assert.equal(audiCredit?.offerType, "bonus");

  const q5Apr = offers.find((offer) => offer.offerTitle === "2025 Audi Q5 quattro Finance 3.99% APR for 72 months");
  assert.equal(q5Apr?.offerType, "finance");

  const q5SportbackApr = offers.find((offer) => offer.offerTitle === "2025 Audi Q5 Sportback 45 TFSI Finance 3.99% APR for 72 months");
  assert.equal(q5SportbackApr?.offerType, "finance");
});

test("parseAudiOffers preserves Sportback TFSI text and SQ5 Sportback image inference", () => {
  const markdown = `
![Image 1: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/q5-sb/2025_GUNAAY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### $1,500 Loyalty Bonus

Current Audi owners can receive a $1,500 customer bonus when you purchase or lease a select, new 2025 Audi Q5 Sportback 45 TFSI.*Offer ends 06/01/2026.

Offer ends June 1, 2026

*View offer details

![Image 2: vehicle-sample-img](https://nar.media.audi.com/is/image/audinar/country/us/en/offers/assets/2025/sq5-sb/2025_GUWSPY_Premium_Plus_Standard_Image.png?fmt=png-alpha)

#### 3.99%

*APR

#### 72

Months

For highly qualified customers.

Offer ends June 1, 2026

*View offer details
`;

  const offers = parseAudiOffers(markdown);
  const loyalty = offers.find((offer) => offer.offerTitle === "2025 Audi Q5 Sportback 45 TFSI $1,500 Loyalty Bonus");
  assert.equal(loyalty?.offerModel, "2025 Audi Q5 Sportback 45 TFSI");

  const sq5Apr = offers.find((offer) => offer.offerTitle === "2025 Audi SQ5 Sportback Finance 3.99% APR for 72 months");
  assert.equal(sq5Apr?.offerType, "finance");
});
