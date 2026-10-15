const statusMessage = document.querySelector("#status");
const dataPanel = document.querySelector("#data-panel");
const tableHead = document.querySelector("#table-head");
const tableBody = document.querySelector("#table-body");
const summary = document.querySelector("#summary");
const measurementSelect = document.querySelector("#measurement-select");
const downloadLink = document.querySelector("#download-link");

loadMeasurementFiles();

async function loadMeasurementFiles() {
  try {
    const response = await fetch("mesurements/index.json");
    if (!response.ok) {
      throw new Error(`Could not load the measurement file list (HTTP ${response.status}).`);
    }

    const manifest = await response.json();
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error("The measurement file list is empty.");
    }
    if (manifest.files.some((file) => typeof file !== "string" || !/^[\w.-]+\.csv$/i.test(file))) {
      throw new Error("The measurement file list contains an invalid CSV filename.");
    }

    measurementSelect.replaceChildren(...manifest.files.map((file) => {
      const option = document.createElement("option");
      option.value = file;
      option.textContent = file;
      return option;
    }));
    measurementSelect.disabled = false;
    measurementSelect.addEventListener("change", () => loadMeasurements(measurementSelect.value));
    await loadMeasurements(measurementSelect.value);
  } catch (error) {
    showError(error, "Could not load measurement files. Check mesurements/index.json.");
  }
}

async function loadMeasurements(fileName) {
  measurementSelect.disabled = true;
  dataPanel.hidden = true;
  statusMessage.classList.remove("is-error");
  statusMessage.textContent = `Loading ${fileName}…`;

  try {
    const response = await fetch(`mesurements/${encodeURIComponent(fileName)}`);
    if (!response.ok) {
      throw new Error(`Could not load ${fileName} (HTTP ${response.status}).`);
    }

    const content = await response.text();
    const { headers, rows } = parseMeasurementCsv(content, fileName);
    renderTable(headers, rows);
    statusMessage.textContent = `Loaded ${rows.length.toLocaleString()} measurements from ${fileName}.`;
    downloadLink.href = `mesurements/${encodeURIComponent(fileName)}`;
    dataPanel.hidden = false;
  } catch (error) {
    showError(error, `Could not load ${fileName}. Check that it is in the mesurements folder.`);
  } finally {
    measurementSelect.disabled = false;
  }
}

function showError(error, fallbackMessage) {
  statusMessage.textContent = error instanceof Error
    ? `${error.message} Open this page through a web server (GitHub Pages or localhost), not directly as a file.`
    : fallbackMessage;
  statusMessage.classList.add("is-error");
}

function parseMeasurementCsv(content, fileName) {
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ""));
  const headerIndex = records.findIndex((record) =>
    record[0]?.startsWith("Document Formatting") && record[0].includes(" - "),
  );

  if (headerIndex < 0) {
    throw new Error(`The measurement column header was not found in ${fileName}.`);
  }

  const headerRecord = records[headerIndex];
  const headers = [
    headerRecord[0].split(" - ").pop().trim(),
    ...headerRecord.slice(1).map((header) => header.trim()),
  ];
  if (headers.length < 2 || headers.some((header) => header.length === 0)) {
    throw new Error(`The measurement column header is incomplete in ${fileName}.`);
  }

  const firstDataIndex = records.findIndex((record, index) =>
    index > headerIndex
    && record.length === headers.length
    && record.some((value) => value.trim().length > 0),
  );
  if (firstDataIndex < 0) {
    throw new Error(`No measurement rows were found in ${fileName}.`);
  }

  const rows = records
    .slice(firstDataIndex)
    .filter((record) => record.some((value) => value.trim().length > 0));
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].length !== headers.length) {
      throw new Error(
        `${fileName}, CSV record ${firstDataIndex + index + 1} has ${rows[index].length} fields; expected ${headers.length}.`,
      );
    }
  }

  return { headers, rows };
}

function parseCsvRecords(content) {
  const records = [];
  let record = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (insideQuotes) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      insideQuotes = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      if (record.some((value) => value.length > 0)) {
        records.push(record);
      }
      record = [];
      field = "";
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error("The CSV contains a quoted field that was not closed.");
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

function renderTable(headers, rows) {
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = header;
    headerRow.append(cell);
  }
  tableHead.replaceChildren(headerRow);

  const tableRows = document.createDocumentFragment();
  for (const values of rows) {
    const row = document.createElement("tr");
    for (const value of values) {
      const cell = document.createElement("td");
      if (value.length === 0) {
        cell.textContent = "—";
        cell.classList.add("is-empty");
        cell.setAttribute("aria-label", "Empty value");
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    }
    tableRows.append(row);
  }
  tableBody.replaceChildren(tableRows);

  const dates = [...new Set(rows.map((row) => row.at(-2)).filter(Boolean))];
  const recorded = dates.length ? ` · Recorded ${dates.join(", ")}` : "";
  summary.textContent = `${rows.length.toLocaleString()} measurements · ${headers.length} columns${recorded}`;
}
