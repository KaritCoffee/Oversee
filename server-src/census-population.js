function parseCensusPopulationCsv(csv, centroids = {}) {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error("Census population file was empty");
  const header = rows[0].map((value) => String(value || "").trim().toUpperCase());
  const stateIndex = header.indexOf("STATE");
  const nameIndex = header.indexOf("NAME");
  const summaryIndex = header.indexOf("SUMLEV");
  const populationColumns = header
    .map((name, index) => ({ name, index, match: /^POPESTIMATE(\d{4})$/.exec(name) }))
    .filter((column) => column.match)
    .sort((left, right) => Number(right.match[1]) - Number(left.match[1]));
  const populationColumn = populationColumns[0];
  if (stateIndex < 0 || nameIndex < 0 || !populationColumn) {
    throw new Error("Census population file had an unexpected schema");
  }

  return rows.slice(1)
    .map((row) => {
      if (summaryIndex >= 0 && String(row[summaryIndex] || "").padStart(3, "0") !== "040") return null;
      const fips = String(row[stateIndex] || "").padStart(2, "0");
      const centroid = centroids[fips];
      const population = Number(String(row[populationColumn.index] || "").replaceAll(",", ""));
      if (!centroid || !Number.isFinite(population)) return null;
      return {
        fips,
        name: String(row[nameIndex] || "").trim(),
        population,
        vintage: populationColumn.match[1],
        centroid,
      };
    })
    .filter(Boolean);
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(csv || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

module.exports = { parseCensusPopulationCsv, parseCsvRows };
