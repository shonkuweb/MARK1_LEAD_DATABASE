/**
 * Exports data to a CSV file.
 * @param {Array<Object>} extractedData The raw data to export
 */
export function exportToCsv(extractedData) {
  if (extractedData.length === 0) {
    alert("No data to export yet.");
    return;
  }
  
  // Build CSV
  const headers = ["Business Name", "Contact Number", "Email Address", "Social Link", "Remarks"];
  const rows = extractedData.map(d => [
    `"${(d.business_name || '').replace(/"/g, '""')}"`,
    `"${(d.contact_number || '').replace(/"/g, '""')}"`,
    `"${(d.email_address || '').replace(/"/g, '""')}"`,
    `"${(d.social_link || '').replace(/"/g, '""')}"`,
    `"${(d.remarks || '').replace(/"/g, '""')}"`
  ]);
  
  const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  
  // Download Mechanism
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `nexus_iq_export_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
