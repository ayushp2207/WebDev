/**
 * SF Stays — Airbnb listings demo
 *
 * Loads the first 50 listings from a local JSON snapshot with fetch/await and
 * renders them as cards. The extra twist is the compare tray: tick up to three
 * listings and a drawer slides up that lines them up field by field, including
 * the amenities that only one of the three actually has.
 */
function MainModule(listingsID = "#listings") {
  const me = {};

  const MAX_COMPARE = 3;
  const LISTINGS_TO_SHOW = 50;
  const DATA_URL = "./airbnb_sf_listings_500.json";

  // A tiny grey "no photo" square, used when a remote image 404s.
  const FALLBACK_IMAGE =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
         <rect width="400" height="300" fill="#e9ecef"/>
         <text x="50%" y="50%" text-anchor="middle" fill="#adb5bd"
               font-family="sans-serif" font-size="18">photo unavailable</text>
       </svg>`
    );

  const listingsElement = document.querySelector(listingsID);
  const statusElement = document.querySelector("#status");
  const subtitleElement = document.querySelector("#listingsSubtitle");
  const trayElement = document.querySelector("#compareTray");
  const trayBodyElement = document.querySelector("#compareBody");
  const compareCountElement = document.querySelector("#compareCount");
  const navCompareCountElement = document.querySelector("#navCompareCount");
  const openTrayButton = document.querySelector("#openTrayBtn");
  const clearCompareButton = document.querySelector("#clearCompare");
  const closeCompareButton = document.querySelector("#closeCompare");

  // Listings currently on screen, plus an id -> listing index for the tray.
  let listings = [];
  const listingsById = new Map();
  // Insertion-ordered, which is exactly the left-to-right order of the tray.
  const selectedIds = new Set();

  // ---------------------------------------------------------------- helpers

  function escapeHTML(value) {
    const chars = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(value ?? "").replace(/[&<>"']/g, (char) => chars[char]);
  }

  // Descriptions in this dataset carry raw markup like <br /> and <b>.
  function stripTags(value) {
    return String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trimEnd() + "…";
  }

  // "amenities" arrives as a JSON-encoded string, not a real array.
  function parseAmenities(listing) {
    try {
      const parsed = JSON.parse(listing.amenities);
      return Array.isArray(parsed) ? parsed.map((a) => String(a).trim()) : [];
    } catch (error) {
      console.warn("Could not parse amenities for listing", listing.id, error);
      return [];
    }
  }

  // "$1,234.00" -> 1234
  function parsePrice(price) {
    const number = Number(String(price ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function formatPrice(number) {
    if (number === null) return "—";
    return "$" + number.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function formatRating(rating) {
    if (rating === null || rating === undefined) return "New";
    return "★ " + Number(rating).toFixed(2);
  }

  function isSuperhost(listing) {
    return listing.host_is_superhost === "t";
  }

  // Names look like "Condo in San Francisco · ★4.87 · 1 bedroom · 2 beds".
  // The leading chunk is the only part worth using as a title; the rest is
  // already available as structured fields.
  function getTitle(listing) {
    const [first] = String(listing.name ?? "").split("·");
    return (first || "Airbnb listing").trim();
  }

  function getSpecs(listing) {
    const specs = [];
    if (listing.accommodates) {
      specs.push(
        `${listing.accommodates} guest${listing.accommodates === 1 ? "" : "s"}`
      );
    }
    if (listing.bedrooms) {
      specs.push(`${listing.bedrooms} bd`);
    }
    if (listing.beds) {
      specs.push(`${listing.beds} bed${listing.beds === 1 ? "" : "s"}`);
    }
    if (listing.bathrooms_text) {
      specs.push(String(listing.bathrooms_text).toLowerCase());
    }
    return specs;
  }

  function getHostSince(listing) {
    if (!listing.host_since) return "";
    const year = new Date(listing.host_since).getFullYear();
    return Number.isFinite(year) ? `Hosting since ${year}` : "";
  }

  // ----------------------------------------------------------- card drawing

  function getAmenityChips(listing, visibleCount = 5) {
    const amenities = parseAmenities(listing);
    if (amenities.length === 0) {
      return `<p class="amenities-empty mb-0">No amenities listed</p>`;
    }

    const chips = amenities
      .slice(0, visibleCount)
      .map((amenity) => `<li class="chip">${escapeHTML(amenity)}</li>`)
      .join("");

    const remaining = amenities.length - visibleCount;
    const more =
      remaining > 0
        ? `<li class="chip chip-more">+${remaining} more</li>`
        : "";

    return `<ul class="amenity-list">${chips}${more}</ul>`;
  }

  function getListingCode(listing) {
    const title = getTitle(listing);
    const description = truncate(stripTags(listing.description), 200);
    const price = parsePrice(listing.price);
    const specs = getSpecs(listing).join(" · ");
    const hostSince = getHostSince(listing);

    return `<div class="col-12 col-md-6 col-lg-4">
  <article class="listing card h-100" id="listing-${listing.id}">
    <div class="listing-media">
      <img
        src="${escapeHTML(listing.picture_url)}"
        class="card-img-top"
        alt="${escapeHTML(title)}"
        loading="lazy"
      />
      <span class="price-badge">${formatPrice(price)}<small>/night</small></span>
      ${
        isSuperhost(listing)
          ? `<span class="superhost-badge" title="Superhost">Superhost</span>`
          : ""
      }
    </div>

    <div class="card-body d-flex flex-column">
      <h3 class="card-title h6">${escapeHTML(title)}</h3>

      <p class="listing-meta">
        <span class="rating">${formatRating(listing.review_scores_rating)}</span>
        <span class="text-body-secondary">(${listing.number_of_reviews ?? 0})</span>
        <span class="text-body-secondary">· ${escapeHTML(
          listing.neighbourhood_cleansed ?? "San Francisco"
        )}</span>
      </p>

      <p class="listing-specs">${escapeHTML(specs)}</p>

      <p class="card-text listing-description">${escapeHTML(
        description || "No description provided for this listing."
      )}</p>

      ${getAmenityChips(listing)}

      <div class="listing-host mt-auto">
        <img
          class="host-avatar"
          src="${escapeHTML(listing.host_thumbnail_url)}"
          alt="${escapeHTML(listing.host_name ?? "Host")}"
          loading="lazy"
        />
        <div class="host-text">
          <span class="host-name">${escapeHTML(listing.host_name ?? "Host")}</span>
          <span class="host-since">${escapeHTML(hostSince)}</span>
        </div>
      </div>

      <div class="listing-actions">
        <div class="form-check mb-0">
          <input
            class="form-check-input compare-checkbox"
            type="checkbox"
            id="compare-${listing.id}"
            data-listing-id="${listing.id}"
          />
          <label class="form-check-label" for="compare-${listing.id}">Compare</label>
        </div>
        <a
          class="btn btn-sm btn-outline-dark"
          href="${escapeHTML(listing.listing_url)}"
          target="_blank"
          rel="noopener"
          >View on Airbnb</a
        >
      </div>
    </div>
  </article>
</div>`;
  }

  function redraw(data) {
    listings = data;
    listingsById.clear();
    listings.forEach((listing) => listingsById.set(String(listing.id), listing));

    listingsElement.innerHTML = listings.map(getListingCode).join("\n");

    updateSummaryStats();
    syncCheckboxes();
  }

  // --------------------------------------------------------- summary stats

  function updateSummaryStats() {
    const prices = listings
      .map((listing) => parsePrice(listing.price))
      .filter((price) => price !== null)
      .sort((a, b) => a - b);

    const ratings = listings
      .map((listing) => listing.review_scores_rating)
      .filter((rating) => typeof rating === "number");

    const median =
      prices.length === 0
        ? null
        : prices.length % 2
          ? prices[(prices.length - 1) / 2]
          : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;

    const averageRating =
      ratings.length === 0
        ? null
        : ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;

    document.querySelector("#statCount").textContent = listings.length;
    document.querySelector("#statPrice").textContent = formatPrice(median);
    document.querySelector("#statRating").textContent = formatRating(averageRating);
    document.querySelector("#statSuperhosts").textContent =
      listings.filter(isSuperhost).length + " of " + listings.length;
  }

  // ------------------------------------------------------------ compare tray

  /**
   * Rows of the comparison table. `get` pulls a raw value, `format` turns it
   * into display text, and `best` marks whether the lowest or highest value
   * wins so the tray can highlight it.
   */
  const COMPARE_ROWS = [
    {
      label: "Price / night",
      get: (listing) => parsePrice(listing.price),
      format: formatPrice,
      best: "min",
    },
    {
      label: "Rating",
      get: (listing) =>
        typeof listing.review_scores_rating === "number"
          ? listing.review_scores_rating
          : null,
      format: formatRating,
      best: "max",
    },
    {
      label: "Reviews",
      get: (listing) => listing.number_of_reviews ?? 0,
      format: (value) => String(value),
      best: "max",
    },
    {
      label: "Guests",
      get: (listing) => listing.accommodates ?? null,
      format: (value) => (value === null ? "—" : String(value)),
      best: "max",
    },
    {
      label: "Bedrooms / beds",
      get: (listing) => `${listing.bedrooms ?? "—"} / ${listing.beds ?? "—"}`,
    },
    {
      label: "Bathrooms",
      get: (listing) => listing.bathrooms_text || "—",
    },
    {
      label: "Neighborhood",
      get: (listing) => listing.neighbourhood_cleansed || "—",
    },
    {
      label: "Minimum nights",
      get: (listing) => listing.minimum_nights ?? null,
      format: (value) => (value === null ? "—" : String(value)),
      best: "min",
    },
    {
      label: "Host",
      get: (listing) =>
        (listing.host_name || "Host") + (isSuperhost(listing) ? " ⭐" : ""),
    },
    {
      label: "Amenities",
      get: (listing) => parseAmenities(listing).length,
      format: (value) => String(value),
      best: "max",
    },
  ];

  /**
   * For each selected listing, the amenities no other selected listing offers.
   * This is the whole reason the tray exists — it answers "what do I actually
   * gain by picking this one?" in a way a grid of cards never does.
   */
  function getExclusiveAmenities(selection) {
    const amenitySets = selection.map(
      (listing) => new Set(parseAmenities(listing))
    );

    return selection.map((listing, index) =>
      [...amenitySets[index]].filter((amenity) =>
        amenitySets.every(
          (otherSet, otherIndex) =>
            otherIndex === index || !otherSet.has(amenity)
        )
      )
    );
  }

  /** Index of the winning cell for a row, or -1 when there is no clear winner. */
  function getBestIndex(row, values) {
    if (!row.best) return -1;

    const numeric = values.map((value) =>
      typeof value === "number" ? value : null
    );
    const present = numeric.filter((value) => value !== null);
    if (present.length < 2) return -1;

    const target =
      row.best === "min" ? Math.min(...present) : Math.max(...present);
    // A tie means nobody wins — highlighting both would be noise.
    if (present.filter((value) => value === target).length > 1) return -1;

    return numeric.indexOf(target);
  }

  function getSelectedListings() {
    return [...selectedIds]
      .map((id) => listingsById.get(id))
      .filter(Boolean);
  }

  function getTrayColumnHeader(listing) {
    return `<th scope="col">
      <div class="compare-col-head">
        <img
          src="${escapeHTML(listing.picture_url)}"
          alt=""
          class="compare-thumb"
          loading="lazy"
        />
        <div class="compare-col-title">
          <a href="#listing-${listing.id}" class="compare-name">${escapeHTML(
            truncate(getTitle(listing), 40)
          )}</a>
          <button
            class="btn btn-sm btn-link p-0 compare-remove"
            type="button"
            data-remove-id="${listing.id}"
          >
            Remove
          </button>
        </div>
      </div>
    </th>`;
  }

  function getExclusiveRow(selection) {
    const exclusives = getExclusiveAmenities(selection);

    const cells = exclusives
      .map((amenities) => {
        if (selection.length < 2) {
          return `<td class="text-body-secondary">Add another listing to see
            what makes this one different.</td>`;
        }
        if (amenities.length === 0) {
          return `<td class="text-body-secondary">Nothing the others don't also
            offer.</td>`;
        }
        const chips = amenities
          .slice(0, 8)
          .map((amenity) => `<li class="chip chip-unique">${escapeHTML(amenity)}</li>`)
          .join("");
        const remaining = amenities.length - 8;
        const more =
          remaining > 0 ? `<li class="chip chip-more">+${remaining} more</li>` : "";
        return `<td><ul class="amenity-list mb-0">${chips}${more}</ul></td>`;
      })
      .join("");

    return `<tr class="compare-exclusive-row">
      <th scope="row">Only here</th>
      ${cells}
    </tr>`;
  }

  function renderTray() {
    const selection = getSelectedListings();

    compareCountElement.textContent = selection.length;
    navCompareCountElement.textContent = selection.length;
    openTrayButton.disabled = selection.length === 0;

    if (selection.length === 0) {
      trayBodyElement.innerHTML = "";
      setTrayOpen(false);
      return;
    }

    const bodyRows = COMPARE_ROWS.map((row) => {
      const values = selection.map((listing) => row.get(listing));
      const bestIndex = getBestIndex(row, values);

      const cells = values
        .map((value, index) => {
          const text = row.format ? row.format(value) : String(value);
          const isBest = index === bestIndex;
          return `<td class="${isBest ? "is-best" : ""}">${escapeHTML(text)}${
            isBest ? `<span class="best-flag">best</span>` : ""
          }</td>`;
        })
        .join("");

      return `<tr><th scope="row">${escapeHTML(row.label)}</th>${cells}</tr>`;
    }).join("");

    trayBodyElement.innerHTML = `<table class="table compare-table align-middle mb-0">
      <thead>
        <tr>
          <th scope="col" class="compare-corner">
            ${selection.length} of ${MAX_COMPARE} selected
          </th>
          ${selection.map(getTrayColumnHeader).join("")}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        ${getExclusiveRow(selection)}
      </tbody>
    </table>`;

    setTrayOpen(true);
  }

  function setTrayOpen(isOpen) {
    trayElement.classList.toggle("is-open", isOpen);
    trayElement.setAttribute("aria-hidden", String(!isOpen));
    // A closed tray is still in the DOM, so take its buttons out of the tab
    // order too — aria-hidden alone would leave them focusable.
    trayElement.inert = !isOpen;
    document.body.classList.toggle("tray-open", isOpen);
  }

  /** Reflect the selection in the cards, and lock the rest at the cap. */
  function syncCheckboxes() {
    const atCapacity = selectedIds.size >= MAX_COMPARE;

    listingsElement.querySelectorAll(".compare-checkbox").forEach((checkbox) => {
      const isSelected = selectedIds.has(checkbox.dataset.listingId);
      checkbox.checked = isSelected;
      checkbox.disabled = atCapacity && !isSelected;
      checkbox
        .closest(".listing")
        .classList.toggle("is-comparing", isSelected);
    });
  }

  function toggleCompare(listingId) {
    if (selectedIds.has(listingId)) {
      selectedIds.delete(listingId);
    } else if (selectedIds.size < MAX_COMPARE) {
      selectedIds.add(listingId);
    }

    syncCheckboxes();
    renderTray();
  }

  function clearCompare() {
    selectedIds.clear();
    syncCheckboxes();
    renderTray();
  }

  // ---------------------------------------------------------------- loading

  function showError(error) {
    statusElement.innerHTML = `<div class="alert alert-danger text-start" role="alert">
      <h3 class="h6">Could not load the listings</h3>
      <p class="mb-2 small">${escapeHTML(error.message)}</p>
      <p class="mb-0 small text-body-secondary">
        If you opened this file directly from disk, browsers block
        <code>fetch()</code> on <code>file://</code> URLs. Serve the folder over
        HTTP instead, for example <code>npx http-server .</code>.
      </p>
    </div>`;
    statusElement.hidden = false;
  }

  async function loadData() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const allListings = await response.json();
      const firstFifty = allListings.slice(0, LISTINGS_TO_SHOW);

      me.redraw(firstFifty);

      statusElement.hidden = true;
      subtitleElement.textContent = `Showing the first ${firstFifty.length} of ${allListings.length} listings`;
    } catch (error) {
      console.error("Failed to load listings", error);
      showError(error);
    }
  }

  // ----------------------------------------------------------------- events

  listingsElement.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".compare-checkbox");
    if (!checkbox) return;
    toggleCompare(checkbox.dataset.listingId);
  });

  // Image errors don't bubble, so listen during the capture phase.
  listingsElement.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (image.tagName !== "IMG" || image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = "true";
      image.src = FALLBACK_IMAGE;
    },
    true
  );

  trayBodyElement.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-id]");
    if (!removeButton) return;
    toggleCompare(removeButton.dataset.removeId);
  });

  clearCompareButton.addEventListener("click", clearCompare);
  closeCompareButton.addEventListener("click", () => setTrayOpen(false));
  openTrayButton.addEventListener("click", () => {
    if (selectedIds.size > 0) setTrayOpen(true);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setTrayOpen(false);
  });

  me.redraw = redraw;
  me.loadData = loadData;

  return me;
}

const main = MainModule();

main.loadData();
