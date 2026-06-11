const svg = d3.select("svg");

const width = 900;
const height = 640;

svg
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const tooltip = d3.select(".tooltip");

const projection = d3.geoNaturalEarth1()
  .center([22, -5])
  .scale(340)
  .translate([width / 2, height / 2 - 10]);

const path = d3.geoPath().projection(projection);

const g = svg.append("g");

const noDataColor = "#EDF3F2";

const colorScale = d3.scaleThreshold()
  .domain([0.10, 0.25, 0.50])
  .range([
    "#DCEDEA",
    "#79B9A7",
    "#BBD96B",
    "#F2D35F"
  ]);

const hoverColor = "#CBEF5A";

const formatPercent = d3.format(".1%");
const formatNumber = d3.format(",");

let selectedFeature = null;

Promise.all([
  d3.json("world.geojson"),
  d3.csv("map_data.csv")
]).then(([geoData, csvData]) => {

  geoData.features = geoData.features.filter(d => {
    const p = d.properties || {};

    const names = [
      p.name,
      p.NAME,
      p.admin,
      p.ADMIN,
      p.name_long,
      p.NAME_LONG
    ];

    return !names.includes("Western Sahara") &&
           !names.includes("W. Sahara") &&
           !names.includes("Somaliland");
  });

  const dataByCode = new Map();

  csvData.forEach(d => {
    dataByCode.set(d.country_code, {
      country_name: d.country_name,
      country_code: d.country_code,
      tier_4plus_share: +d.tier_4plus_share,
      tier_4plus_pop: +d.tier_4plus_pop,
      slug: d.slug
    });
  });

  const countries = g.selectAll("path")
    .data(geoData.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", d => {
      const row = dataByCode.get(getIso3(d));
      return row ? colorScale(row.tier_4plus_share) : noDataColor;
    })

    .on("mouseover", function(event, d) {

      const row = dataByCode.get(getIso3(d));

      d3.select(this)
        .raise()
        .attr("fill", row ? hoverColor : "#E7EFED");

      const countryName = row?.country_name || getCountryName(d);

      tooltip
        .style("opacity", 1)
        .html(row ? `
          <strong>${countryName}</strong><br>
          Tier 4+ share: ${formatPercent(row.tier_4plus_share)}<br>
          Tier 4+ population: ${formatNumber(row.tier_4plus_pop)}
        ` : `
          <strong>${countryName}</strong><br>
          No data currently available
        `);

    })

    .on("mousemove", function(event) {
      tooltip
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY - 28) + "px");
    })

    .on("mouseout", function(event, d) {

      const row = dataByCode.get(getIso3(d));

      if (selectedFeature !== d) {
        d3.select(this)
          .attr("fill", row ? colorScale(row.tier_4plus_share) : noDataColor);
      }

      tooltip.style("opacity", 0);

    })

    .on("click", function(event, d) {

      selectCountry(d);

      const row = dataByCode.get(getIso3(d));

      if (row?.slug) {
        console.log(`/country/${row.slug}`);
      }

    });

  // ZOOM

  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // SEARCH

  const input = d3.select("#country-search");
  const resultsBox = d3.select("#search-results");

  input.on("input", function() {

    const query = this.value.toLowerCase().trim();

    if (!query) {
      resultsBox.style("display", "none");
      return;
    }

    const matches = csvData.filter(d =>
      d.country_name.toLowerCase().includes(query)
    );

    resultsBox
      .style("display", matches.length ? "block" : "none");

    resultsBox.selectAll(".search-item")
      .data(matches.slice(0, 8))
      .join("div")
      .attr("class", "search-item")
      .text(d => d.country_name)

      .on("click", function(event, d) {

        input.property("value", d.country_name);

        resultsBox.style("display", "none");

        const feature = geoData.features.find(f =>
          getIso3(f) === d.country_code
        );

        if (!feature) return;

        selectCountry(feature);

        zoomToFeature(feature);

      });

  });

  // RESET BUTTON

  d3.select("#reset-map").on("click", () => {

    selectedFeature = null;

    countries
      .attr("fill", d => {
        const row = dataByCode.get(getIso3(d));
        return row ? colorScale(row.tier_4plus_share) : noDataColor;
      });

    svg.transition()
      .duration(1000)
      .call(
        zoom.transform,
        d3.zoomIdentity
      );

  });

  function selectCountry(feature) {

    selectedFeature = feature;

    countries
      .attr("fill", d => {
        const row = dataByCode.get(getIso3(d));
        return row ? colorScale(row.tier_4plus_share) : noDataColor;
      });

    countries
      .filter(d => d === feature)
      .attr("fill", hoverColor);

  }

  function zoomToFeature(feature) {

    const bounds = path.bounds(feature);

    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;

    const scale = Math.max(
      1,
      Math.min(
        6,
        0.9 / Math.max(dx / width, dy / height)
      )
    );

    const translate = [
      width / 2 - scale * x,
      height / 2 - scale * y
    ];

    svg.transition()
      .duration(1200)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(translate[0], translate[1])
          .scale(scale)
      );

  }

  drawLegend();

});

function getIso3(d) {

  const p = d.properties || {};

  return p.iso_a3 ||
         p.ISO_A3 ||
         p.adm0_a3 ||
         p.ADM0_A3 ||
         p.sov_a3 ||
         p.SOV_A3 ||
         p.iso3 ||
         p.ISO3;

}

function getCountryName(d) {

  const p = d.properties || {};

  return p.name_long ||
         p.NAME_LONG ||
         p.admin ||
         p.ADMIN ||
         p.name ||
         p.NAME ||
         "Country";

}

function drawLegend() {

  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", "translate(55, 430)");

  legend.append("text")
    .attr("class", "legend-title")
    .attr("x", 0)
    .attr("y", -14)
    .text("Population at MTF Tier 4+");

  const legendData = [
    {label: "No data", color: noDataColor},
    {label: "<10%", color: "#DCEDEA"},
    {label: "10–25%", color: "#79B9A7"},
    {label: "25–50%", color: "#BBD96B"},
    {label: ">50%", color: "#F2D35F"}
  ];

  const item = legend.selectAll(".legend-item")
    .data(legendData)
    .join("g")
    .attr("transform", (d, i) => `translate(0, ${i * 24})`);

  item.append("rect")
    .attr("width", 16)
    .attr("height", 16)
    .attr("rx", 2)
    .attr("fill", d => d.color)
    .attr("stroke", "rgba(46, 92, 115, 0.25)");

  item.append("text")
    .attr("x", 24)
    .attr("y", 13)
    .text(d => d.label);

}
