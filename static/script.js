(function() {
    const uploadForm = document.getElementById('uploadForm');
    const askForm = document.getElementById('askForm');
    const reportBtn = document.getElementById('reportBtn');
    const diagnosisBtn = document.getElementById('diagnosisBtn');
    const alertsBtn = document.getElementById('alertsBtn');
    const riskBtn = document.getElementById('riskBtn');
    const explainabilityBtn = document.getElementById('explainabilityBtn');
    const validationBtn = document.getElementById('validationBtn');
    const fileInput = document.getElementById('files');
    const dropzone = document.getElementById('dropzone');
    const uploadSpinner = document.getElementById('uploadSpinner');
    const uploadSuccess = document.getElementById('uploadSuccess');
    const chat = document.querySelector('.chat');
    const typing = document.getElementById('typing');

    // Drag & drop
    if (dropzone && fileInput) {
        const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter','dragover','dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, prevent));
        ['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, () => dropzone.classList.add('is-dragover')));
        ['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, () => dropzone.classList.remove('is-dragover')));
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                fileInput.files = e.dataTransfer.files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                const f = fileInput.files[0];
                dropzone.querySelector('.dropzone-title').textContent = f.name;
                const size = f.size;
                const pretty = size >= 1048576 ? (size/1048576).toFixed(2) + ' MB' : (size/1024).toFixed(1) + ' KB';
                dropzone.querySelector('.dropzone-subtitle').textContent = pretty;
            }
        });
    }

    // Helper function to show error messages
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    // AJAX upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Check if files are selected
            if (!fileInput.files || fileInput.files.length === 0) {
                showError('Please select at least one file to upload.');
                return;
            }
            
            const formData = new FormData();
            
            // Add all files to formData
            Array.from(fileInput.files).forEach((file) => {
                formData.append('files', file);
            });
            
            // Show loading state
            if (uploadSpinner) uploadSpinner.classList.remove('hidden');
            if (uploadSuccess) uploadSuccess.classList.add('hidden');
            
            // Disable the upload button
            const uploadBtn = uploadForm.querySelector('button[type="submit"]');
            if (uploadBtn) uploadBtn.disabled = true;

            // Send the files to the server
            fetch('/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'  // Add header for CSRF protection
                }
            })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = Array.isArray(data.errors) && data.errors.length
                        ? data.errors.join(' | ')
                        : (data.error || `Upload failed (HTTP ${response.status})`);
                    throw new Error(message);
                }
                return data;
            })
            .then(data => {
                // Hide loading state
                if (uploadSpinner) uploadSpinner.classList.add('hidden');
                
                // Show success message
                if (uploadSuccess) {
                    const processedCount = data.total_files_processed || (data.processed_files ? data.processed_files.length : 0) || 0;
                    const uploadedCount = data.total_files_uploaded || (data.uploaded_files ? data.uploaded_files.length : 0) || 0;
                    const count = uploadedCount || processedCount;
                    const msg = data.message || `Successfully uploaded ${count} file(s)`;
                    uploadSuccess.textContent = `✅ ${msg}`;
                    uploadSuccess.classList.remove('hidden');
                }
                
                // Update file info
                const fileMeta = document.getElementById('fileMeta');
                if (fileMeta) {
                    let files = [];
                    if (Array.isArray(data.processed_files) && data.processed_files.length) {
                        files = data.processed_files;
                    } else if (Array.isArray(data.uploaded_files) && data.uploaded_files.length) {
                        files = data.uploaded_files;
                    }
                    if (files.length) {
                        fileMeta.innerHTML = files.map(file => 
                            `<span class="file-name">${file}</span>
                             <span class="file-status">✔ Uploaded</span>`
                        ).join('');
                    } else {
                        fileMeta.innerHTML = '';
                    }
                }
                
                console.log('Upload successful:', data);
                
                // Reset dropzone text if it exists
                if (dropzone) {
                    const title = dropzone.querySelector('.dropzone-title');
                    const subtitle = dropzone.querySelector('.dropzone-subtitle');
                    if (title) title.textContent = 'Drag & drop files here or click to browse';
                    if (subtitle) subtitle.textContent = 'Supports PDF, TXT, CSV';
                }
            })
            .catch(error => {
                console.error('Error uploading files:', error);
                if (uploadSpinner) uploadSpinner.classList.add('hidden');
                showError(`Upload failed: ${error.message}`);
            })
            .finally(() => {
                // Re-enable the upload button
                if (uploadBtn) uploadBtn.disabled = false;
            });
        });
    }

    // Ask form submission
    if (askForm) {
        askForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const queryInput = document.getElementById('query');
            const query = queryInput.value.trim();
            if (!query) return;

            appendMessage('user', query);
            queryInput.value = '';
            typing.classList.remove('hidden');

            fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: query })
            })
            .then(response => response.json())
            .then(data => {
                typing.classList.add('hidden');
                if (data.error) {
                    appendMessage('ai', 'Error: ' + data.error);
                } else {
                    appendMessage('ai', data.answer, data.references);
                }
            })
            .catch(error => {
                typing.classList.add('hidden');
                appendMessage('ai', 'Error: ' + error);
            });
        });
    }

    // Structured report generation
    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            reportBtn.disabled = true;
            reportBtn.textContent = "⏳ Generating Report...";

            fetch('/structured-report')
                .then(res => res.json())
                .then(data => {
                    reportBtn.disabled = false;
                    reportBtn.textContent = "Generate Report";
                    const reportResult = document.getElementById('reportResult');
                    const reportText = document.getElementById('reportText');
                    reportResult.classList.remove('hidden');
                    if (data.error) {
                        reportText.textContent = "⚠️ " + data.error;
                    } else {
                        reportText.innerHTML = data.report.replace(/\n/g, '<br/>');
                    }
                })
                .catch(err => {
                    reportBtn.disabled = false;
                    reportBtn.textContent = "Generate Report";
                    const reportResult = document.getElementById('reportResult');
                    const reportText = document.getElementById('reportText');
                    reportResult.classList.remove('hidden');
                    reportText.textContent = "⚠️ Error: " + err.message;
                });
        });
    }

    /**
     * Creates an interactive table with sorting, searching, and pagination
     * @param {Array} data - The data to display in the table
     * @param {Array} columns - Column configuration
     * @param {HTMLElement} container - The container to render the table in
     * @param {Object} options - Additional options
     */
    function createTable(data, columns, container, options = {}) {
        // Default options
        const {
            sortable = true,
            searchable = true,
            pagination = false,
            rowsPerPage = 10,
            tableId = 'data-table-' + Math.random().toString(36).substr(2, 9)
        } = options;

        // Clear container
        container.innerHTML = '';
        
        // Check if no data
        if (!data || !data.length) {
            container.innerHTML = '<div class="no-data">No data available</div>';
            return;
        }

        // Create search box if searchable
        if (searchable) {
            const searchDiv = document.createElement('div');
            searchDiv.className = 'table-search';
            searchDiv.innerHTML = `
                <div class="search-container">
                    <input type="text" id="${tableId}-search" placeholder="Search..." class="search-input">
                    <span class="search-icon">🔍</span>
                </div>
                <div id="${tableId}-search-count" class="search-count">
                    Showing ${data.length} of ${data.length} items
                </div>
            `;
            container.appendChild(searchDiv);
        }

        // Create table
        const table = document.createElement('table');
        table.className = 'data-table';
        table.id = tableId;
        
        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        columns.forEach((column, index) => {
            const th = document.createElement('th');
            th.textContent = column.header;
            
            // Add sorting indicator if sortable
            if (sortable && column.sortable !== false) {
                th.classList.add('sortable');
                th.setAttribute('data-sort', index);
                th.setAttribute('data-order', 'none');
                
                const sortIcon = document.createElement('span');
                sortIcon.className = 'sort-icon';
                sortIcon.innerHTML = ' ↕️';
                th.appendChild(sortIcon);
            }
            
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create body
        const tbody = document.createElement('tbody');
        
        // Function to render rows
        const renderRows = (items) => {
            tbody.innerHTML = ''; // Clear existing rows
            
            if (!items || !items.length) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = columns.length;
                cell.textContent = 'No matching records found';
                cell.className = 'no-results';
                row.appendChild(cell);
                tbody.appendChild(row);
                return;
            }
            
            items.forEach(item => {
                const row = document.createElement('tr');
                
                columns.forEach(column => {
                    const td = document.createElement('td');
                    let value = column.accessor ? column.accessor(item) : item[column.key];
                    
                    // Handle undefined/null values
                    if (value === undefined || value === null) {
                        value = '-';
                    }
                    
                    // Handle arrays (e.g., for lists of findings)
                    if (Array.isArray(value)) {
                        if (value.length === 0) {
                            td.textContent = '-';
                        } else {
                            const ul = document.createElement('ul');
                            ul.className = 'value-list';
                            
                            value.forEach(liText => {
                                if (liText) {
                                    const li = document.createElement('li');
                                    li.textContent = liText;
                                    ul.appendChild(li);
                                }
                            });
                            
                            td.appendChild(ul);
                        }
                    } 
                    // Handle objects (for nested data)
                    else if (typeof value === 'object' && value !== null) {
                        const pre = document.createElement('pre');
                        pre.className = 'json-value';
                        pre.textContent = JSON.stringify(value, null, 2);
                        td.appendChild(pre);
                    }
                    // Handle HTML content
                    else if (column.isHTML) {
                        td.innerHTML = value;
                    }
                    // Handle status indicators
                    else if (column.isStatus) {
                        const statusClass = value.toLowerCase().replace(/\s+/g, '-');
                        td.innerHTML = `<span class="status-${statusClass}">${value}</span>`;
                    }
                    // Default text content
                    else {
                        td.textContent = value || '-';
                    }
                    
                    // Add tooltip if specified
                    if (column.tooltip) {
                        td.setAttribute('title', column.tooltip);
                        td.classList.add('has-tooltip');
                    }
                    
                    // Add custom classes
                    if (column.className) {
                        td.classList.add(column.className);
                    }
                    
                    row.appendChild(td);
                });
                
                tbody.appendChild(row);
            });
        };
        
        // Initial render
        renderRows(data);
        table.appendChild(tbody);
        
        // Add table to container
        container.appendChild(table);
        
        // Initialize sorting if enabled
        if (sortable) {
            const sortableHeaders = table.querySelectorAll('th.sortable');
            
            sortableHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    const columnIndex = parseInt(header.getAttribute('data-sort'));
                    const currentOrder = header.getAttribute('data-order') || 'none';
                    const column = columns[columnIndex];
                    
                    // Reset sort indicators
                    sortableHeaders.forEach(h => {
                        h.setAttribute('data-order', 'none');
                        const icon = h.querySelector('.sort-icon');
                        if (icon) icon.textContent = ' ↕️';
                    });
                    
                    // Toggle sort order
                    let newOrder = 'none';
                    if (currentOrder === 'none' || currentOrder === 'desc') {
                        newOrder = 'asc';
                        header.setAttribute('data-order', 'asc');
                        header.querySelector('.sort-icon').textContent = ' ↑';
                    } else {
                        newOrder = 'desc';
                        header.setAttribute('data-order', 'desc');
                        header.querySelector('.sort-icon').textContent = ' ↓';
                    }
                    
                    // Sort the data
                    if (newOrder !== 'none') {
                        const sortKey = column.key || column.accessor;
                        const sortedData = [...data].sort((a, b) => {
                            let valA, valB;
                            
                            if (column.accessor) {
                                valA = column.accessor(a);
                                valB = column.accessor(b);
                            } else {
                                valA = a[sortKey];
                                valB = b[sortKey];
                            }
                            
                            // Handle undefined/null values
                            if (valA === undefined || valA === null) valA = '';
                            if (valB === undefined || valB === null) valB = '';
                            
                            // Convert to string for comparison if not already
                            if (typeof valA !== 'string') valA = String(valA);
                            if (typeof valB !== 'string') valB = String(valB);
                            
                            // Compare values
                            if (valA < valB) return newOrder === 'asc' ? -1 : 1;
                            if (valA > valB) return newOrder === 'asc' ? 1 : -1;
                            return 0;
                        });
                        
                        // Re-render with sorted data
                        renderRows(sortedData);
                    } else {
                        // Revert to original order
                        renderRows([...data]);
                    }
                });
            });
        }
        
        // Initialize search if enabled
        if (searchable) {
            const searchInput = document.getElementById(`${tableId}-search`);
            const searchCount = document.getElementById(`${tableId}-search-count`);
            
            const performSearch = () => {
                const searchTerm = searchInput.value.toLowerCase();
                
                if (!searchTerm) {
                    renderRows(data);
                    searchCount.textContent = `Showing ${data.length} of ${data.length} items`;
                    return;
                }
                
                const filteredData = data.filter(item => {
                    // Check each column for a match
                    return columns.some(column => {
                        let value;
                        
                        if (column.accessor) {
                            value = column.accessor(item);
                        } else if (column.key) {
                            value = item[column.key];
                        } else {
                            return false;
                        }
                        
                        // Handle different value types
                        if (Array.isArray(value)) {
                            return value.some(v => 
                                String(v).toLowerCase().includes(searchTerm)
                            );
                        } else if (value && typeof value === 'object') {
                            return JSON.stringify(value).toLowerCase().includes(searchTerm);
                        } else if (value) {
                            return String(value).toLowerCase().includes(searchTerm);
                        }
                        
                        return false;
                    });
                });
                
                renderRows(filteredData);
                searchCount.textContent = `Showing ${filteredData.length} of ${data.length} items`;
            };
            
            searchInput.addEventListener('input', performSearch);
        }
        
        // Initialize pagination if enabled
        if (pagination) {
            // Pagination implementation would go here
            // This is a simplified version
            const totalPages = Math.ceil(data.length / rowsPerPage);
            
            if (totalPages > 1) {
                const paginationDiv = document.createElement('div');
                paginationDiv.className = 'pagination';
                
                // Previous button
                const prevButton = document.createElement('button');
                prevButton.textContent = 'Previous';
                prevButton.disabled = true;
                
                // Page info
                const pageInfo = document.createElement('span');
                pageInfo.className = 'page-info';
                pageInfo.textContent = `Page 1 of ${totalPages}`;
                
                // Next button
                const nextButton = document.createElement('button');
                nextButton.textContent = 'Next';
                nextButton.disabled = totalPages <= 1;
                
                paginationDiv.appendChild(prevButton);
                paginationDiv.appendChild(pageInfo);
                paginationDiv.appendChild(nextButton);
                container.appendChild(paginationDiv);
                
                // Pagination event handlers would go here
            }
        }
        
        return table;
    }

    // Ranked Diagnosis List
    if (diagnosisBtn) {
        diagnosisBtn.addEventListener('click', () => {
            diagnosisBtn.disabled = true;
            diagnosisBtn.textContent = "⏳ Analyzing...";
            const diagnosisResult = document.getElementById('diagnosisResult');
            const diagnosisText = document.getElementById('diagnosisText');
            diagnosisResult.classList.remove('hidden');
            diagnosisText.innerHTML = '<div class="loading">Analyzing patient data for potential diagnoses...</div>';

            fetch('/ranked-diagnosis')
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    diagnosisBtn.disabled = false;
                    diagnosisBtn.textContent = "Generate Ranked Diagnosis";
                    
                    if (data.error) {
                        diagnosisText.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>`;
                        return;
                    }
                    
                    // Ensure we have the expected data structure
                    const diagnoses = data.diagnoses || [];
                    
                    if (diagnoses.length > 0) {
                        const columns = [
                            { 
                                header: 'Rank', 
                                accessor: item => item.rank || 'N/A',
                                sortable: true,
                                key: 'rank',
                                className: 'rank-column'
                            },
                            { 
                                header: 'Diagnosis', 
                                accessor: item => item.diagnosis || 'No diagnosis provided',
                                sortable: true,
                                key: 'diagnosis'
                            },
                            { 
                                header: 'Confidence', 
                                accessor: item => {
                                    const confidence = (item.confidence || 'Low').toLowerCase();
                                    return `<span class="confidence-${confidence}">${item.confidence || 'N/A'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'confidence',
                                className: 'confidence-column'
                            },
                            { 
                                header: 'Key Findings', 
                                accessor: item => item.key_findings || ['No key findings available'],
                                sortable: false,
                                className: 'findings-column'
                            },
                            { 
                                header: 'Justification', 
                                accessor: item => item.justification || 'No justification provided',
                                sortable: false,
                                className: 'justification-column'
                            }
                        ];
                        
                        createTable(diagnoses, columns, diagnosisText, {
                            sortable: true,
                            searchable: true,
                            pagination: diagnoses.length > 10,
                            rowsPerPage: 5
                        });
                    } else {
                        diagnosisText.innerHTML = `
                            <div class="no-data">
                                <p>No diagnoses found in the patient data.</p>
                                <p>This could be due to insufficient information in the uploaded documents.</p>
                            </div>`;
                    }
                })
                .catch(err => {
                    console.error('Error fetching diagnosis:', err);
                    diagnosisBtn.disabled = false;
                    diagnosisBtn.textContent = "Generate Ranked Diagnosis";
                    diagnosisText.innerHTML = `
                        <div class="error-message">
                            <p>⚠️ Error: ${err.message}</p>
                            <p>Please try again or check the console for more details.</p>
                        </div>`;
                });
        });
    }

    // Red-Flag Alerts
    if (alertsBtn) {
        alertsBtn.addEventListener('click', () => {
            alertsBtn.disabled = true;
            alertsBtn.textContent = "⏳ Scanning...";
            const alertsResult = document.getElementById('alertsResult');
            const alertsText = document.getElementById('alertsText');
            alertsResult.classList.remove('hidden');
            alertsText.innerHTML = '<div class="loading">Scanning for urgent medical conditions that require immediate attention...</div>';

            fetch('/red-flag-alerts')
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    alertsBtn.disabled = false;
                    alertsBtn.textContent = "Check for Alerts";
                    
                    if (data.error) {
                        alertsText.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>`;
                        return;
                    }
                    
                    // Ensure we have the expected data structure
                    const alerts = data.alerts || [];
                    
                    if (alerts.length > 0) {
                        const columns = [
                            { 
                                header: 'Condition', 
                                accessor: item => item.condition || 'Unspecified condition',
                                sortable: true,
                                key: 'condition',
                                className: 'condition-column'
                            },
                            { 
                                header: 'Priority', 
                                accessor: item => {
                                    const priority = (item.priority || 'Low').toLowerCase();
                                    return `<span class="priority-${priority}">${item.priority || 'N/A'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'priority',
                                className: 'priority-column'
                            },
                            { 
                                header: 'Severity', 
                                accessor: item => {
                                    const severity = (item.severity || 'Moderate').toLowerCase();
                                    return `<span class="severity-${severity}">${item.severity || 'N/A'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'severity',
                                className: 'severity-column'
                            },
                            { 
                                header: 'Key Indicators', 
                                accessor: item => item.key_indicators || ['No indicators specified'],
                                sortable: false,
                                className: 'indicators-column'
                            },
                            { 
                                header: 'Recommended Action', 
                                accessor: item => item.escalation || 'No specific action recommended',
                                sortable: false,
                                className: 'action-column'
                            }
                        ];
                        
                        createTable(alerts, columns, alertsText, {
                            sortable: true,
                            searchable: true,
                            pagination: alerts.length > 5,
                            rowsPerPage: 5
                        });
                    } else {
                        alertsText.innerHTML = `
                            <div class="success-message">
                                <p>✅ No urgent medical conditions requiring immediate attention were identified.</p>
                                <p>This is a positive finding. Continue with routine monitoring as appropriate.</p>
                            </div>`;
                    }
                })
                .catch(err => {
                    console.error('Error fetching red flag alerts:', err);
                    alertsBtn.disabled = false;
                    alertsBtn.textContent = "Check for Alerts";
                    alertsText.innerHTML = `
                        <div class="error-message">
                            <p>⚠️ Error: ${err.message}</p>
                            <p>Please try again or check the console for more details.</p>
                        </div>`;
                });
        });
    }

    // Risk Stratification analysis
    if (riskBtn) {
        riskBtn.addEventListener('click', () => {
            riskBtn.disabled = true;
            riskBtn.textContent = "⏳ Analyzing...";
            const riskResult = document.getElementById('riskResult');
            const riskText = document.getElementById('riskText');
            riskResult.classList.remove('hidden');
            riskText.innerHTML = '<div class="loading">Evaluating patient risk factors and generating stratification...</div>';

            fetch('/risk-stratification')
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    riskBtn.disabled = false;
                    riskBtn.textContent = "Analyze Risk Level";
                    
                    if (data.error) {
                        riskText.innerHTML = `<div class="error-message">⚠️ ${data.error}</div>`;
                        return;
                    }
                    
                    // Create a container for the risk assessment
                    const riskContainer = document.createElement('div');
                    riskContainer.className = 'risk-assessment';
                    
                    // Overall risk summary
                    const riskLevel = (data.risk_level || 'Low').toLowerCase();
                    const summaryHtml = `
                        <div class="risk-summary">
                            <h3>Overall Risk Level: <span class="risk-${riskLevel}">${data.risk_level || 'Not Specified'}</span></h3>
                            <p class="summary-text">${data.summary || 'No summary available.'}</p>
                        </div>
                    `;
                    
                    riskContainer.innerHTML = summaryHtml;
                    
                    // Add risk factors if available
                    if (data.factors && data.factors.length > 0) {
                        const factorsSection = document.createElement('div');
                        factorsSection.className = 'risk-factors';
                        factorsSection.innerHTML = '<h4>Key Risk Factors</h4>';
                        
                        const factorColumns = [
                            { 
                                header: 'Factor', 
                                accessor: item => item.factor || 'Unspecified factor',
                                sortable: true,
                                key: 'factor',
                                className: 'factor-column'
                            },
                            { 
                                header: 'Severity', 
                                accessor: item => {
                                    const severity = (item.severity || 'Moderate').toLowerCase();
                                    return `<span class="severity-${severity}">${item.severity || 'N/A'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'severity',
                                className: 'severity-column'
                            },
                            { 
                                header: 'Description', 
                                accessor: item => item.description || 'No description available',
                                sortable: false,
                                className: 'description-column'
                            },
                            { 
                                header: 'Impact', 
                                accessor: item => item.impact || 'Not specified',
                                sortable: true,
                                key: 'impact',
                                className: 'impact-column'
                            }
                        ];
                        
                        createTable(data.factors, factorColumns, factorsSection, {
                            sortable: true,
                            searchable: true,
                            pagination: data.factors.length > 5,
                            rowsPerPage: 5
                        });
                        
                        riskContainer.appendChild(factorsSection);
                    }
                    
                    // Add recommendations if available
                    if (data.recommendations && data.recommendations.length > 0) {
                        const recSection = document.createElement('div');
                        recSection.className = 'recommendations';
                        recSection.innerHTML = `
                            <h4>Recommendations</h4>
                            <div class="recommendations-list">
                                <ul>
                                    ${data.recommendations.map(rec => 
                                        `<li>${rec}</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        `;
                        riskContainer.appendChild(recSection);
                    }
                    
                    // Add any additional data
                    if (data.additional_info) {
                        const additionalInfo = document.createElement('div');
                        additionalInfo.className = 'additional-info';
                        additionalInfo.innerHTML = `
                            <h4>Additional Information</h4>
                            <div class="info-content">${data.additional_info}</div>
                        `;
                        riskContainer.appendChild(additionalInfo);
                    }
                    
                    // Clear and append the content
                    riskText.innerHTML = '';
                    riskText.appendChild(riskContainer);
                })
                .catch(err => {
                    console.error('Error fetching risk stratification:', err);
                    riskBtn.disabled = false;
                    riskBtn.textContent = "Analyze Risk Level";
                    riskText.innerHTML = `
                        <div class="error-message">
                            <p>⚠️ Error: ${err.message}</p>
                            <p>Please try again or check the console for more details.</p>
                        </div>`;
                });
        });
    // Explainability Pack generation
    if (explainabilityBtn) {
        explainabilityBtn.addEventListener('click', () => {
            explainabilityBtn.disabled = true;
            explainabilityBtn.textContent = "⏳ Generating...";
            const explainabilityResult = document.getElementById('explainabilityResult');
            const explainabilityText = document.getElementById('explainabilityText');
            explainabilityResult.classList.remove('hidden');
            explainabilityText.innerHTML = `
                <div class="loading">
                    <p>Generating comprehensive explainability pack...</p>
                    <p>This may take a moment as we analyze the clinical reasoning behind the AI's outputs.</p>
                </div>`;

            fetch('/explainability-pack')
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    explainabilityBtn.disabled = false;
                    explainabilityBtn.textContent = "Generate Explainability Pack";
                    
                    if (data.error) {
                        explainabilityText.innerHTML = `
                            <div class="error-message">
                                <p>⚠️ ${data.error}</p>
                                <p>Please try again or contact support if the issue persists.</p>
                            </div>`;
                        return;
                    }
                    
                    // Create main container
                    const container = document.createElement('div');
                    container.className = 'explainability-pack';
                    
                    // Header section
                    container.innerHTML = `
                        <div class="explainability-header">
                            <h2>AI Explainability Pack</h2>
                            <p class="subtitle">Transparent insights into the AI's clinical reasoning process</p>
                            <div class="metadata">
                                <span>Generated: ${new Date().toLocaleString()}</span>
                                ${data.model_info ? `<span>Model: ${data.model_info}</span>` : ''}
                            </div>
                        </div>
                    `;
                    
                    // Add summary if available
                    if (data.summary) {
                        const summarySection = document.createElement('div');
                        summarySection.className = 'explainability-summary';
                        summarySection.innerHTML = `
                            <h3>Summary</h3>
                            <div class="summary-content">${data.summary}</div>
                        `;
                        container.appendChild(summarySection);
                    }
                    
                    // Add mappings section if available
                    if (data.mappings && data.mappings.length > 0) {
                        const mappingsSection = document.createElement('div');
                        mappingsSection.className = 'mappings-section';
                        mappingsSection.innerHTML = '<h3>Clinical Findings Mappings</h3>';
                        
                        const columns = [
                            { 
                                header: 'Clinical Finding', 
                                accessor: item => item.finding || 'Unspecified finding',
                                sortable: true,
                                key: 'finding',
                                className: 'finding-column'
                            },
                            { 
                                header: 'AI Interpretation', 
                                accessor: item => item.interpretation || 'No interpretation available',
                                sortable: false,
                                className: 'interpretation-column'
                            },
                            { 
                                header: 'Evidence', 
                                accessor: item => item.evidence || 'No supporting evidence',
                                sortable: false,
                                className: 'evidence-column'
                            },
                            { 
                                header: 'Confidence', 
                                accessor: item => {
                                    const confidence = (item.confidence || 'Medium').toLowerCase();
                                    return `<span class="confidence-${confidence}">${item.confidence || 'N/A'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'confidence',
                                className: 'confidence-column'
                            }
                        ];
                        
                        createTable(data.mappings, columns, mappingsSection, {
                            sortable: true,
                            searchable: true,
                            pagination: data.mappings.length > 5,
                            rowsPerPage: 5
                        });
                        
                        container.appendChild(mappingsSection);
                    }
                    
                    // Add limitations section if available
                    if (data.limitations) {
                        const limitationsSection = document.createElement('div');
                        limitationsSection.className = 'limitations';
                        limitationsSection.innerHTML = `
                            <h3>Limitations & Considerations</h3>
                            <div class="limitations-content">
                                ${Array.isArray(data.limitations) 
                                    ? `<ul>${data.limitations.map(lim => `<li>${lim}</li>`).join('')}</ul>`
                                    : data.limitations}
                            </div>
                        `;
                        container.appendChild(limitationsSection);
                    }
                    
                    // Add notes if available
                    if (data.notes) {
                        const notesSection = document.createElement('div');
                        notesSection.className = 'notes';
                        notesSection.innerHTML = `
                            <h3>Additional Notes</h3>
                            <div class="notes-content">${data.notes}</div>
                        `;
                        container.appendChild(notesSection);
                    }
                    
                    // Clear and append the content
                    explainabilityText.innerHTML = '';
                    explainabilityText.appendChild(container);
                    
                    // Add a print button
                    const printButton = document.createElement('button');
                    printButton.className = 'print-button';
                    printButton.innerHTML = '🖨️ Print Explainability Pack';
                    printButton.onclick = () => window.print();
                    explainabilityText.insertBefore(printButton, container);
                })
                .catch(err => {
                    console.error('Error generating explainability pack:', err);
                    explainabilityBtn.disabled = false;
                    explainabilityBtn.textContent = "Generate Explainability Pack";
                    explainabilityText.innerHTML = `
                        <div class="error-message">
                            <p>⚠️ Error: ${err.message}</p>
                            <p>Please try again or check the console for more details.</p>
                        </div>`;
                });
        });
    }

    // Validation Notes generation
    if (validationBtn) {
        validationBtn.addEventListener('click', () => {
            validationBtn.disabled = true;
            validationBtn.textContent = "⏳ Validating...";
            const validationResult = document.getElementById('validationResult');
            const validationText = document.getElementById('validationText');
            validationResult.classList.remove('hidden');
            validationText.innerHTML = `
                <div class="loading">
                    <p>Performing comprehensive validation of AI outputs...</p>
                    <p>This may take a moment as we verify the reliability and accuracy of the results.</p>
                </div>`;

            fetch('/validation-notes')
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    validationBtn.disabled = false;
                    validationBtn.textContent = "Generate Validation Notes";
                    
                    if (data.error) {
                        validationText.innerHTML = `
                            <div class="error-message">
                                <p>⚠️ ${data.error}</p>
                                <p>Please try again or contact support if the issue persists.</p>
                            </div>`;
                        return;
                    }
                    
                    // Create main container
                    const container = document.createElement('div');
                    container.className = 'validation-notes';
                    
                    // Header section
                    container.innerHTML = `
                        <div class="validation-header">
                            <h2>AI Output Validation Report</h2>
                            <p class="subtitle">Comprehensive validation of AI-generated clinical insights</p>
                            <div class="metadata">
                                <span>Validated: ${new Date().toLocaleString()}</span>
                                ${data.model_info ? `<span>Model: ${data.model_info}</span>` : ''}
                            </div>
                        </div>
                        <div class="validation-summary">
                            <h3>Validation Summary</h3>
                            <p>${data.summary || 'No summary available for this validation report.'}</p>
                        </div>
                    `;
                    
                    // Review Checkpoints
                    if (data.review_checkpoints && data.review_checkpoints.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'validation-section';
                        section.innerHTML = '<h3>Review Checkpoints</h3>';
                        
                        const columns = [
                            { 
                                header: 'Checkpoint', 
                                accessor: item => item.checkpoint || 'Unspecified checkpoint',
                                sortable: true,
                                key: 'checkpoint',
                                className: 'checkpoint-column'
                            },
                            { 
                                header: 'Status', 
                                accessor: item => {
                                    const status = (item.status || 'pending').toLowerCase().replace(/\s+/g, '-');
                                    return `<span class="status-${status}">${item.status || 'Pending'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'status',
                                className: 'status-column'
                            },
                            { 
                                header: 'Notes', 
                                accessor: item => item.notes || 'No notes provided',
                                sortable: false,
                                className: 'notes-column'
                            },
                            { 
                                header: 'Verified By', 
                                accessor: item => item.verified_by || 'System',
                                sortable: true,
                                key: 'verified_by',
                                className: 'verifier-column'
                            }
                        ];
                        
                        createTable(data.review_checkpoints, columns, section, {
                            sortable: true,
                            searchable: true,
                            pagination: data.review_checkpoints.length > 5,
                            rowsPerPage: 5
                        });
                        
                        container.appendChild(section);
                    }
                    
                    // Stress Tests
                    if (data.stress_tests && data.stress_tests.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'validation-section';
                        section.innerHTML = '<h3>Stress Tests</h3>';
                        
                        const columns = [
                            { 
                                header: 'Test Case', 
                                accessor: item => item.test_case || 'Unspecified test case',
                                sortable: true,
                                key: 'test_case',
                                className: 'testcase-column'
                            },
                            { 
                                header: 'Result', 
                                accessor: item => {
                                    const result = (item.result || 'pending').toLowerCase();
                                    return `<span class="result-${result}">${item.result || 'Pending'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'result',
                                className: 'result-column'
                            },
                            { 
                                header: 'Observations', 
                                accessor: item => item.observations || 'No observations recorded',
                                sortable: false,
                                className: 'observations-column'
                            },
                            { 
                                header: 'Impact', 
                                accessor: item => item.impact || 'Not specified',
                                sortable: true,
                                key: 'impact',
                                className: 'impact-column'
                            }
                        ];
                        
                        createTable(data.stress_tests, columns, section, {
                            sortable: true,
                            searchable: true,
                            pagination: data.stress_tests.length > 5,
                            rowsPerPage: 5
                        });
                        
                        container.appendChild(section);
                    }
                    
                    // Robustness Checks
                    if (data.robustness_checks && data.robustness_checks.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'validation-section';
                        section.innerHTML = '<h3>Robustness Checks</h3>';
                        
                        const columns = [
                            { 
                                header: 'Check', 
                                accessor: item => item.check || 'Unspecified check',
                                sortable: true,
                                key: 'check',
                                className: 'check-column'
                            },
                            { 
                                header: 'Status', 
                                accessor: item => {
                                    const status = (item.status || 'pending').toLowerCase().replace(/\s+/g, '-');
                                    return `<span class="status-${status}">${item.status || 'Pending'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'status',
                                className: 'status-column'
                            },
                            { 
                                header: 'Details', 
                                accessor: item => item.details || 'No details provided',
                                sortable: false,
                                className: 'details-column'
                            },
                            { 
                                header: 'Severity', 
                                accessor: item => {
                                    const severity = (item.severity || 'medium').toLowerCase();
                                    return `<span class="severity-${severity}">${item.severity || 'Medium'}</span>`;
                                },
                                isHTML: true,
                                sortable: true,
                                key: 'severity',
                                className: 'severity-column'
                            }
                        ];
                        
                        createTable(data.robustness_checks, columns, section, {
                            sortable: true,
                            searchable: true,
                            pagination: data.robustness_checks.length > 5,
                            rowsPerPage: 5
                        });
                        
                        container.appendChild(section);
                    }
                    
                    // Assumptions
                    if (data.assumptions && data.assumptions.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'assumptions-section';
                        section.innerHTML = `
                            <h3>Key Assumptions</h3>
                            <div class="assumptions-list">
                                <ul>
                                    ${data.assumptions.map(assumption => 
                                        `<li>${assumption}</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        `;
                        container.appendChild(section);
                    }
                    
                    // Add conclusions if available
                    if (data.conclusions) {
                        const section = document.createElement('div');
                        section.className = 'conclusions-section';
                        section.innerHTML = `
                            <h3>Validation Conclusions</h3>
                            <div class="conclusions-content">
                                ${Array.isArray(data.conclusions) 
                                    ? `<ul>${data.conclusions.map(conc => `<li>${conc}</li>`).join('')}</ul>`
                                    : data.conclusions}
                            </div>
                        `;
                        container.appendChild(section);
                    }
                    
                    // Clear and append the content
                    validationText.innerHTML = '';
                    validationText.appendChild(container);
                    
                    // Add a print button
                    const printButton = document.createElement('button');
                    printButton.className = 'print-button';
                    printButton.innerHTML = '🖨️ Print Validation Report';
                    printButton.onclick = () => window.print();
                    validationText.insertBefore(printButton, container);
                })
                .catch(err => {
                    console.error('Error generating validation notes:', err);
                    validationBtn.disabled = false;
                    validationBtn.textContent = "Generate Validation Notes";
                    validationText.innerHTML = `
                        <div class="error-message">
                            <p>⚠️ Error: ${err.message}</p>
                            <p>Please try again or check the console for more details.</p>
                        </div>`;
                });
        });
    }

    // Function to append messages to the chat
    function appendMessage(sender, text, references = []) {
        const chat = document.getElementById('chat');
        if (!chat) return;
    
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message', sender);
    
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.innerHTML = text.replace(/\n/g, '<br>');
        messageWrapper.appendChild(messageContent);
    
        if (references && references.length > 0) {
            const refs = document.createElement('div');
            refs.classList.add('answer-refs');
            refs.innerHTML = '<strong>References:</strong><br/>' + references.join('<br/>');
            messageWrapper.appendChild(refs);
        }
    
        chat.appendChild(messageWrapper);
        chat.scrollTop = chat.scrollHeight;
    }
    
    // Validation Notes button handler
    validationBtn.addEventListener("click", () => {
        validationBtn.disabled = true;
        validationBtn.textContent = "Generating...";
        validationText.innerHTML = "";
    
        fetch("/validation-notes")
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                appendMessage("system", data.validation_notes);
                validationBtn.disabled = false;
                validationBtn.textContent = "Generate Validation Notes";
            })
            .catch(err => {
                console.error('Error generating validation notes:', err);
                validationBtn.disabled = false;
                validationBtn.textContent = "Generate Validation Notes";
                validationText.innerHTML = `
                    <div class="error-message">
                        <p>⚠️ Error: ${err.message}</p>
                        <p>Please try again or check the console for more details.</p>
                    </div>`;
            });
    });