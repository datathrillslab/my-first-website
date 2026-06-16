# Read the CSV file
$inputFile = "c:\Users\HP\Code\Network Diagram\Erasmus_Staff_Mobility_Consolidated CSV UTF.csv"
$outputFile = "c:\Users\HP\Code\Network Diagram\Erasmus_Staff_Mobility_Consolidated CSV UTF_cleaned.csv"

# Read all content as text
$content = Get-Content $inputFile -Encoding UTF8

# Process each line
$newLines = @()
foreach ($line in $content) {
    # Match the Round column pattern: text like "Initial round (10.9.2020)" and extract just the date
    # The pattern matches any text followed by a date in parentheses in the Round field
    $newLine = $line -replace '(Initial round|Intermediate round|Intermediate 1st round|Intermediate 2nd round|Intermediate 3rd round|1st round|2nd round|3rd round|3rd final round|4th final round)\s*\((\d+\.\d+\.\d+)\)', '$2'
    $newLines += $newLine
}

# Write the output
$newLines | Set-Content $outputFile -Encoding UTF8

Write-Host "Done! Cleaned file saved to: $outputFile"
Write-Host "Total lines processed: $($newLines.Count)"
