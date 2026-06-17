const fs = require('fs');

const inputFile = 'c:\\Users\\HP\\Code\\Network Diagram\\Erasmus_Staff_Mobility_Consolidated CSV UTF_cleaned.csv';
const outputFile = 'c:\\Users\\HP\\Code\\my-first-website\\index.html';

// Simple CSV parser
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const headers = lines[0].split(',');
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = [];
        let inQuotes = false;
        let current = '';
        for (let j = 0; j < lines[i].length; j++) {
            const char = lines[i][j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current);
        
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h.trim()] = row[idx] ? row[idx].trim() : '';
        });
        results.push(obj);
    }
    return results;
}

try {
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const data = parseCSV(csvContent);
    
    // Filter for Academy of Applied Arts
    const apuriData = data.filter(d => {
        const fac = d['Faculty / Department / Academy'] || '';
        return fac.includes('APU') || fac.includes('Akademija primijenjenih umjetnosti');
    });
    
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APURI Erasmus Mobility Network</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        #visualization {
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .node-apuri { fill: #d9480f; stroke: #fff; stroke-width: 2px; }
        .node-prof { fill: #228be6; stroke: #fff; stroke-width: 2px; }
        .node-uni { fill: #40c057; stroke: #fff; stroke-width: 2px; }
        .link { stroke: #ced4da; stroke-opacity: 0.6; stroke-width: 1.5px; fill: none; }
        .label { font-size: 11px; fill: #495057; text-anchor: middle; font-weight: 500; }
        .label-bg { fill: white; fill-opacity: 0.8; }
        .year-axis-line { stroke: #adb5bd; stroke-dasharray: 4,4; }
        .year-label { font-size: 14px; fill: #495057; font-weight: bold; text-anchor: end; }
        
        .tooltip {
            position: absolute;
            background: white;
            padding: 8px 12px;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-size: 12px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        }
    </style>
</head>
<body>
    <div id="visualization"></div>
    <div id="tooltip" class="tooltip"></div>

    <script>
        const rawData = ${JSON.stringify(apuriData)};
        
        // Define dimensions
        const width = 1000;
        const height = 800;
        const margin = { top: 60, right: 100, bottom: 120, left: 150 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Process data into nodes and links
        // We have three types of nodes:
        // 1. APURI (Root)
        // 2. Professors (Intermediate)
        // 3. Universities (Leaves)
        
        const nodes = [];
        const links = [];
        
        // Add APURI node
        nodes.push({ id: 'APURI', type: 'apuri', label: 'APURI' });
        
        // Extract unique years and sort them
        const years = [...new Set(rawData.map(d => d['Academic Year']))].filter(Boolean).sort();
        
        // Create a Y scale for the years
        const yScale = d3.scalePoint()
            .domain(years)
            .range([margin.top + 100, height - margin.bottom - 100])
            .padding(0.5);

        // Map universities to ensure uniqueness
        const uniMap = new Map();
        let uniCount = 0;
        
        rawData.forEach(d => {
            const profId = \`\${d['First Name']} \${d['Last Name']} (\${d['Academic Year']})\`;
            const uniName = d['Foreign Institution'];
            const year = d['Academic Year'];
            
            // Add Professor node if not exists
            if (!nodes.find(n => n.id === profId)) {
                nodes.push({
                    id: profId,
                    type: 'prof',
                    label: \`\${d['First Name']} \${d['Last Name']}\`,
                    year: year
                });
                
                // Link APURI -> Professor
                links.push({ source: 'APURI', target: profId });
            }
            
            // Add University node if not exists
            if (uniName && !uniMap.has(uniName)) {
                uniMap.set(uniName, \`uni_\${uniCount++}\`);
                nodes.push({
                    id: uniMap.get(uniName),
                    type: 'uni',
                    label: uniName
                });
            }
            
            // Link Professor -> University
            if (uniName) {
                links.push({ source: profId, target: uniMap.get(uniName) });
            }
        });

        // Set fixed positions for specific nodes
        nodes.forEach(d => {
            if (d.type === 'apuri') {
                d.fx = width / 2;
                d.fy = margin.top;
            } else if (d.type === 'uni') {
                // We'll let them settle at the bottom via forces, or fix them horizontally
                d.fy = height - margin.bottom;
            } else if (d.type === 'prof') {
                // Fix Y position based on year
                d.fy = yScale(d.year);
            }
        });

        const svg = d3.select("#visualization")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Draw Year Axis
        const axisGroup = svg.append("g")
            .attr("class", "axis-group");

        years.forEach(year => {
            const yPos = yScale(year);
            // Label
            axisGroup.append("text")
                .attr("class", "year-label")
                .attr("x", margin.left - 20)
                .attr("y", yPos + 5)
                .text(year);
                
            // Dashed line
            axisGroup.append("line")
                .attr("class", "year-axis-line")
                .attr("x1", margin.left)
                .attr("y1", yPos)
                .attr("x2", width - margin.right)
                .attr("y2", yPos);
        });

        // Simulation
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("x", d3.forceX(width / 2).strength(0.1))
            // Only apply Y force to non-fixed nodes (which are basically just the universities getting pulled horizontally, their Y is fixed)
            .force("collide", d3.forceCollide().radius(25));

        // Draw Links
        const link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link");

        // Draw Nodes
        const nodeGroup = svg.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(nodes)
            .enter().append("g")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // Node circles
        nodeGroup.append("circle")
            .attr("class", d => "node-" + d.type)
            .attr("r", d => d.type === 'apuri' ? 12 : (d.type === 'prof' ? 8 : 10))
            .on("mouseover", showTooltip)
            .on("mouseout", hideTooltip);

        // Labels for APURI and Universities
        const labels = nodeGroup.filter(d => d.type !== 'prof');
        
        // Background for labels
        labels.append("rect")
            .attr("class", "label-bg")
            .attr("rx", 3)
            .attr("ry", 3);
            
        // Text for labels
        const texts = labels.append("text")
            .attr("class", "label")
            .attr("dy", d => d.type === 'apuri' ? -20 : 25)
            .text(d => d.label);

        // Size rects based on text
        setTimeout(() => {
            texts.each(function(d) {
                const bbox = this.getBBox();
                const padding = 4;
                d3.select(this.parentNode).select('rect')
                    .attr("x", bbox.x - padding)
                    .attr("y", bbox.y - padding)
                    .attr("width", bbox.width + padding * 2)
                    .attr("height", bbox.height + padding * 2);
            });
        }, 100);

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            nodeGroup
                .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
                
            // Keep universities spaced out evenly at the bottom
            const unis = nodes.filter(n => n.type === 'uni').sort((a, b) => a.x - b.x);
            if(unis.length > 0) {
                 const spacing = innerWidth / (unis.length + 1);
                 unis.forEach((n, i) => {
                     // Gradually move to ideal sorted position
                     const targetX = margin.left + spacing * (i + 1);
                     n.x += (targetX - n.x) * 0.1; 
                 });
            }
        });

        const tooltip = d3.select("#tooltip");

        function showTooltip(event, d) {
            tooltip.transition().duration(200).style("opacity", .9);
            let html = "";
            if (d.type === 'prof') {
                html = \`<strong>\${d.label}</strong><br/>Year: \${d.year}\`;
            } else if (d.type === 'uni') {
                html = \`<strong>\${d.label}</strong><br/>Foreign Institution\`;
            } else {
                html = \`<strong>Academy of Applied Arts</strong><br/>APURI\`;
            }
            
            tooltip.html(html)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");
                
            d3.select(this).attr("r", d.type === 'apuri' ? 15 : (d.type === 'prof' ? 11 : 13));
        }

        function hideTooltip(event, d) {
            tooltip.transition().duration(500).style("opacity", 0);
            d3.select(this).attr("r", d.type === 'apuri' ? 12 : (d.type === 'prof' ? 8 : 10));
        }

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            if (d.type !== 'apuri' && d.type !== 'prof' && d.type !== 'uni') {
                d.fx = d.x;
                d.fy = d.y;
            }
        }

        function dragged(event, d) {
            // Only allow X drag for fixed Y nodes
            if (d.type === 'prof' || d.type === 'uni') {
                d.fx = event.x;
            } else if (d.type !== 'apuri') {
                d.fx = event.x;
                d.fy = event.y;
            }
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            if (d.type === 'prof') {
                d.fx = null; // Let it find its X position again
            } else if (d.type === 'uni') {
                d.fx = null;
            }
        }
    </script>
</body>
</html>`;

    fs.writeFileSync(outputFile, htmlTemplate, 'utf8');
    console.log('HTML generated successfully at', outputFile);
} catch (error) {
    console.error('Error generating HTML:', error);
}
