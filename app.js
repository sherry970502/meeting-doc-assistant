// 等待 DOM 加载完成后初始化应用
class DocumentAssistant {
    constructor() {
        this.documents = new Map();
        this.currentDoc = null;
        this.currentEncoding = 'utf-8';
        this.readFiles = new Set(); // 存储已读文件的ID
        
        // 确保按正确的顺序初始化
        this.loadReadStatus();
        this.initializeEventListeners();
        this.initializePDFJS();
        this.initializeTextInputModal();
        this.initializeKeywordsModal();
        
        // 加载文档信息
        this.docId = new URLSearchParams(window.location.search).get('docId');
        this.loadDocumentInfo();
        
        // 设置自动保存
        this.autoSaveInterval = null;
        this.setupAutoSave();
        this.initializeDownloadHandlers();
        this.initializeEditor();
    }

    // 初始化 PDF.js
    initializePDFJS() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
    }

    initializeEventListeners() {
        console.log('初始化事件监听器'); // 调试日志
        
        // 导入按钮点击事件
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('file-input');
        
        if (!importBtn || !fileInput) {
            console.error('找不到导入按钮或文件输入元素');
            return;
        }

        // 导入按钮点击事件
        importBtn.addEventListener('click', () => {
            console.log('导入按钮被点击'); // 调试日志
            fileInput.click();
        });

        // 文件选择事件
        fileInput.addEventListener('change', async (event) => {
            console.log('文件被选择'); // 调试日志
            const files = event.target.files;
            if (files.length > 0) {
                await this.handleFileImport(files);
            }
        });

        // 文件切换事件
        const fileList = document.getElementById('file-list');
        if (fileList) {
            fileList.addEventListener('change', (e) => {
                this.switchDocument(e.target.value);
            });
        }

        // 添加编码选择事件
        const encodingSelect = document.getElementById('encoding-select');
        if (encodingSelect) {
            encodingSelect.addEventListener('change', (e) => {
                this.currentEncoding = e.target.value;
                // 如果当前有文档，重新加载它
                if (this.currentDoc) {
                    const currentFileName = Array.from(this.documents.entries())
                        .find(([_, doc]) => doc === this.currentDoc)?.[0];
                    if (currentFileName) {
                        this.reloadDocument(currentFileName);
                    }
                }
            });
        }

        // 添加标记为已读按钮事件
        const markAsReadBtn = document.getElementById('mark-as-read');
        if (markAsReadBtn) {
            markAsReadBtn.addEventListener('click', () => {
                if (this.currentDoc) {
                    const currentFileName = Array.from(this.documents.entries())
                        .find(([_, doc]) => doc === this.currentDoc)?.[0];
                    
                    if (currentFileName) {
                        this.toggleReadStatus(currentFileName);
                    }
                }
            });
        }

        // 添加返回按钮事件
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'document-list.html';
            });
        }

        // 添加标题编辑事件
        const titleElement = document.getElementById('doc-title');
        if (titleElement) {
            titleElement.addEventListener('blur', () => {
                this.updateDocumentTitle(titleElement.textContent.trim());
            });

            // 按下回车时失去焦点
            titleElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleElement.blur();
                }
            });
        }
    }

    initializeDownloadHandlers() {
        const downloadItems = document.querySelectorAll('.dropdown-item');
        downloadItems.forEach(item => {
            item.addEventListener('click', () => {
                const format = item.dataset.format;
                this.downloadDocument(format);
            });
        });
    }

    async handleFileImport(files) {
        console.log('开始处理文件导入', files);
        
        for (const file of files) {
            try {
                console.log('正在读取文件:', file.name);
                const content = await this.readFile(file);
                
                // 存储文档，不再需要单独的关键词集合
                this.documents.set(file.name, {
                    content,
                    highlights: [],
                    annotations: [],
                    originalFile: file
                });

                // 更新文件列表
                this.updateFileList();
                
                // 显示第一个导入的文件
                this.switchDocument(file.name);
                
                console.log('文件导入成功:', file.name);

                // 保存文档内容和相关文件
                this.saveDocumentContent(true);
            } catch (error) {
                console.error('文件导入错误:', error);
                alert(`导入文件 ${file.name} 失败: ${error.message}`);
            }
        }
    }

    async readFile(file) {
        return new Promise((resolve, reject) => {
            // 根据文件类型选择不同的处理方法
            const fileType = file.name.toLowerCase().split('.').pop();
            
            switch (fileType) {
                case 'pdf':
                    this.readPDFFile(file).then(resolve).catch(reject);
                    break;
                case 'doc':
                case 'docx':
                    this.readWordFile(file).then(resolve).catch(reject);
                    break;
                case 'txt':
                default:
                    this.readTextFile(file).then(resolve).catch(reject);
                    break;
            }
        });
    }

    async readPDFFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            let content = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                content += textContent.items.map(item => item.str).join(' ') + '\n';
            }
            
            return content;
        } catch (error) {
            throw new Error(`PDF 解析错误: ${error.message}`);
        }
    }

    async readWordFile(file) {
        try {
            // 使用 mammoth.js 来解析 Word 文件
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({arrayBuffer});
            return result.value;
        } catch (error) {
            throw new Error(`Word 文件解析错误: ${error.message}`);
        }
    }

    async readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const buffer = event.target.result;
                    // 使用当前选择的编码
                    const decoder = new TextDecoder(this.currentEncoding);
                    const content = decoder.decode(buffer);
                    resolve(content);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (error) => {
                reject(new Error(`文件读取错误: ${error}`));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    updateFileList() {
        const fileTree = document.getElementById('file-tree');
        if (!fileTree) return;

        fileTree.innerHTML = '';
        
        // 确保文件列表按名称排序
        const sortedFiles = Array.from(this.documents.entries())
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

        for (const [fileName, doc] of sortedFiles) {
            const fileItem = this.createFileItem(fileName, doc);
            fileTree.appendChild(fileItem);
        }
    }

    createFileItem(fileName, doc) {
        const fileType = fileName.toLowerCase().split('.').pop();
        const isRead = this.readFiles.has(fileName);
        const div = document.createElement('div');
        div.className = `file-item ${isRead ? 'read' : ''}`;
        div.dataset.filename = fileName;
        
        const iconClass = this.getFileIconClass(fileType);
        
        div.innerHTML = `
            <span class="file-icon ${iconClass}"></span>
            <span class="file-name">${fileName}</span>
            <span class="read-status" title="${isRead ? '已读' : '未读'}"></span>
        `;

        div.addEventListener('click', () => {
            const activeItems = document.querySelectorAll('.file-item.active');
            activeItems.forEach(item => item.classList.remove('active'));
            div.classList.add('active');
            this.switchDocument(fileName);
        });

        return div;
    }

    getFileIconClass(fileType) {
        switch (fileType) {
            case 'pdf':
                return 'pdf-icon';
            case 'doc':
            case 'docx':
                return 'word-icon';
            case 'txt':
                return 'txt-icon';
            default:
                return 'txt-icon';
        }
    }

    switchDocument(fileName) {
        if (!fileName) return;
        
        const doc = this.documents.get(fileName);
        if (doc) {
            this.currentDoc = doc;
            this.displayDocument(doc);
            
            // 更新当前文件名显示
            const fileNameElement = document.getElementById('current-file-name');
            if (fileNameElement) {
                fileNameElement.textContent = fileName;
            }

            // 更新编码选择器显示状态
            const encodingSelect = document.getElementById('encoding-select');
            if (encodingSelect) {
                const fileType = fileName.toLowerCase().split('.').pop();
                encodingSelect.style.display = fileType === 'txt' ? 'block' : 'none';
            }

            // 更新标记按钮状态
            this.updateMarkButtonState(fileName);
        }
    }

    displayDocument(doc) {
        const container = document.getElementById('source-content');
        if (!container) return;

        const fileType = doc.originalFile.name.toLowerCase().split('.').pop();
        const fileTypeInfo = this.getFileTypeInfo(fileType);

        // 获取当前会议文档的关键词
        const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
        const docInfo = documents.get(this.docId);
        const keywords = docInfo?.keywords || [];

        let content = doc.content;
        const keywordMatches = new Map();

        // 使用会议文档的关键词进行高亮和统计
        keywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            let matches = content.match(regex);
            keywordMatches.set(keyword, matches ? matches.length : 0);
            content = content.replace(regex, `<span class="keyword-highlight">$&</span>`);
        });

        // 显示文档内容
        container.innerHTML = `
            <div class="document-header">
                <span class="file-type-badge">${fileTypeInfo}</span>
            </div>
            <div class="document-content">
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">${content}</pre>
            </div>
        `;

        // 更新关键词统计
        this.updateKeywordStats(keywordMatches);
    }

    getFileTypeInfo(fileType) {
        switch (fileType) {
            case 'pdf':
                return 'PDF 文档';
            case 'doc':
            case 'docx':
                return 'Word 文档';
            case 'txt':
                return `文本文件 (${this.currentEncoding})`;
            default:
                return '未知类型';
        }
    }

    async reloadDocument(fileName) {
        const file = await this.getOriginalFile(fileName);
        if (file) {
            const content = await this.readFile(file);
            const doc = this.documents.get(fileName);
            if (doc) {
                doc.content = content;
                this.displayDocument(doc);
            }
        }
    }

    getOriginalFile(fileName) {
        const doc = this.documents.get(fileName);
        return doc?.originalFile;
    }

    // 加载已读状态
    loadReadStatus() {
        const savedStatus = localStorage.getItem('readFiles');
        if (savedStatus) {
            this.readFiles = new Set(JSON.parse(savedStatus));
        }
    }

    // 保存已读状态
    saveReadStatus() {
        localStorage.setItem('readFiles', JSON.stringify([...this.readFiles]));
    }

    // 修改切换已读状态的方法
    toggleReadStatus(fileName) {
        const isRead = this.readFiles.has(fileName);
        
        if (isRead) {
            this.readFiles.delete(fileName);
        } else {
            this.readFiles.add(fileName);
        }
        
        // 更新文件列表显示
        this.updateFileList();
        // 保存状态到本地存储
        this.saveReadStatus();
        // 更新按钮状态
        this.updateMarkButtonState(fileName);

        // 更新后触发保存
        this.saveDocumentContent();
    }

    // 添加更新标记按钮状态的方法
    updateMarkButtonState(fileName) {
        const markAsReadBtn = document.getElementById('mark-as-read');
        if (markAsReadBtn) {
            const isRead = this.readFiles.has(fileName);
            const btnText = markAsReadBtn.querySelector('.btn-text');
            const btnIcon = markAsReadBtn.querySelector('.material-icons');
            
            // 更新按钮类
            markAsReadBtn.className = `tool-btn ${isRead ? 'read' : 'unread'}`;
            
            // 更新按钮文本
            if (btnText) {
                btnText.textContent = isRead ? '标记为未读' : '标记为已读';
            }
            
            // 更新图标
            if (btnIcon) {
                btnIcon.textContent = isRead ? 'check_circle' : 'radio_button_unchecked';
            }
        }
    }

    loadDocumentInfo() {
        if (!this.docId) {
            window.location.href = 'document-list.html';
            return;
        }
        
        const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
        const docInfo = documents.get(this.docId);
        
        if (docInfo) {
            // 更新文档标题
            const titleElement = document.getElementById('doc-title');
            if (titleElement) {
                titleElement.textContent = docInfo.title;
            }

            // 加载编辑器内容
            const editor = document.getElementById('editor');
            if (editor && docInfo.content) {
                editor.innerHTML = docInfo.content;
            }

            // 加载相关文件
            if (docInfo.relatedFiles) {
                this.documents.clear();
                this.readFiles.clear();

                docInfo.relatedFiles.forEach(file => {
                    this.documents.set(file.name, {
                        content: file.content,
                        highlights: [],
                        annotations: [],
                        keywords: new Set(file.keywords || []),
                        originalFile: file.originalFile ? new File(
                            [new Blob([file.content])],
                            file.originalFile.name,
                            {
                                type: file.originalFile.type,
                                lastModified: file.originalFile.lastModified
                            }
                        ) : null
                    });

                    if (file.isRead) {
                        this.readFiles.add(file.name);
                    }
                });

                this.updateFileList();
                
                // 如果有文件，显示第一个文件
                const firstFileName = Array.from(this.documents.keys())[0];
                if (firstFileName) {
                    this.switchDocument(firstFileName);
                }
            }
        } else {
            window.location.href = 'document-list.html';
        }
    }

    updateDocumentTitle(newTitle) {
        if (!newTitle) return; // 不允许空标题

        const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
        const docInfo = documents.get(this.docId);
        
        if (docInfo) {
            docInfo.title = newTitle;
            docInfo.updatedAt = new Date().toISOString();
            documents.set(this.docId, docInfo);
            localStorage.setItem('documents', JSON.stringify([...documents]));

            // 显示保存成功提示
            this.showToast('标题已更新');
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(toast);
                }, 300);
            }, 2000);
        }, 100);
    }

    setupAutoSave() {
        // 设置自动保存
        const editor = document.getElementById('editor');
        if (editor) {
            // 监听输入事件
            editor.addEventListener('input', () => {
                this.startAutoSave();
            });
        }
    }

    startAutoSave() {
        // 清除现有的定时器
        if (this.autoSaveInterval) {
            clearTimeout(this.autoSaveInterval);
        }

        // 设置新的定时器（2秒后保存）
        this.autoSaveInterval = setTimeout(() => {
            this.saveDocumentContent();
        }, 2000);
    }

    saveDocumentContent(isFileImport = false) {
        if (!this.docId) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
        const docInfo = documents.get(this.docId);
        
        if (docInfo) {
            // 保存编辑器内容
            docInfo.content = editor.innerHTML;
            docInfo.updatedAt = new Date().toISOString();

            // 保存相关文件，包括文件内容和原始文件对象
            docInfo.relatedFiles = Array.from(this.documents.entries()).map(([name, doc]) => ({
                name,
                content: doc.content,
                isRead: this.readFiles.has(name),
                keywords: Array.from(doc.keywords),
                originalFile: doc.originalFile ? {
                    name: doc.originalFile.name,
                    type: doc.originalFile.type,
                    lastModified: doc.originalFile.lastModified
                } : null
            }));

            documents.set(this.docId, docInfo);
            localStorage.setItem('documents', JSON.stringify([...documents]));
            
            // 只在非文件导入时显示保存提示
            if (!isFileImport) {
                this.showToast('已自动保存');
            }
        }
    }

    async downloadDocument(format) {
        const editor = document.getElementById('editor');
        const titleElement = document.getElementById('doc-title');
        if (!editor || !titleElement) return;

        // 使用 innerHTML 保留格式，但需要清理
        const content = editor.innerHTML
            .replace(/<div>/g, '\n')  // 将 div 转换为换行
            .replace(/<\/div>/g, '')  // 移除结束标签
            .replace(/<br\s*\/?>/g, '\n')  // 将 br 转换为换行
            .replace(/<[^>]+>/g, '')  // 移除其他 HTML 标签
            .replace(/&nbsp;/g, ' ')  // 转换 HTML 空格
            .replace(/&lt;/g, '<')    // 转换 HTML 实体
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        const title = titleElement.textContent.trim() || '未命名文档';
        const date = new Date().toISOString().split('T')[0];
        const fileName = `${title}_${date}`;

        try {
            switch (format) {
                case 'docx':
                    await this.downloadAsWord(content, fileName);
                    break;
                case 'txt':
                    this.downloadAsText(content, fileName);
                    break;
            }
            this.showToast('文档下载成功');
        } catch (error) {
            console.error('下载文档失败:', error);
            this.showToast('下载失败，请重试');
        }
    }

    async downloadAsWord(content, fileName) {
        // 使用 docx 库创建 Word 文档
        const docx = window.docx;
        
        // 将内容按换行符分割
        const paragraphs = content.split('\n').map(text => 
            new docx.Paragraph({
                children: [
                    new docx.TextRun({
                        text: text,
                        size: 24, // 12pt 字体
                        font: 'Microsoft YaHei' // 使用微软雅黑字体
                    })
                ],
                spacing: {
                    after: 200, // 段落后间距
                    line: 360, // 1.5 倍行距
                }
            })
        );

        const doc = new docx.Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440, // 1 inch = 1440 twips
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: paragraphs
            }]
        });

        // 生成文档并下载
        const blob = await docx.Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    downloadAsText(content, fileName) {
        // 确保使用 \r\n 作为换行符，以在 Windows 上正确显示
        const formattedContent = content.replace(/\n/g, '\r\n');
        const blob = new Blob([formattedContent], { 
            type: 'text/plain;charset=utf-8' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    initializeTextInputModal() {
        const newTextBtn = document.getElementById('new-text-btn');
        const modal = document.getElementById('text-input-modal');
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = document.getElementById('cancel-text-btn');
        const saveBtn = document.getElementById('save-text-btn');

        // 打开模态框
        newTextBtn.addEventListener('click', () => {
            modal.classList.add('show');
        });

        // 关闭模态框的多种方式
        const closeModal = () => {
            modal.classList.remove('show');
            document.getElementById('text-file-name').value = '';
            document.getElementById('text-content').value = '';
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // 保存文本文件
        saveBtn.addEventListener('click', () => {
            const fileName = document.getElementById('text-file-name').value.trim();
            const content = document.getElementById('text-content').value;

            if (!fileName) {
                this.showToast('请输入文件名称');
                return;
            }

            if (!content) {
                this.showToast('请输入文件内容');
                return;
            }

            // 创建文本文件
            const fullFileName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
            
            // 存储文档
            this.documents.set(fullFileName, {
                content,
                highlights: [],
                annotations: [],
                keywords: new Set(),
                originalFile: new File([content], fullFileName, { type: 'text/plain' })
            });

            // 更新文件列表
            this.updateFileList();
            
            // 显示新创建的文件
            this.switchDocument(fullFileName);

            // 保存文档
            this.saveDocumentContent(true);

            // 关闭模态框
            closeModal();
            
            this.showToast('文本文件已创建');
        });
    }

    // 修改关键词管理初始化
    initializeKeywordsModal() {
        const keywordsBtn = document.getElementById('keywords-btn');
        const modal = document.getElementById('keywords-modal');
        const closeBtn = modal.querySelector('.close-btn');
        const keywordInput = document.getElementById('keyword-input');
        const addKeywordBtn = document.getElementById('add-keyword-btn');

        if (!keywordsBtn || !modal || !closeBtn || !keywordInput || !addKeywordBtn) {
            console.error('找不到关键词管理相关元素');
            return;
        }

        keywordsBtn.addEventListener('click', () => {
            modal.classList.add('show');
            this.renderKeywordsList();
            keywordInput.focus();
        });

        const closeModal = () => {
            modal.classList.remove('show');
            keywordInput.value = '';
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const addKeyword = () => {
            const keyword = keywordInput.value.trim();
            if (keyword) {
                // 获取当前文档信息
                const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
                const docInfo = documents.get(this.docId);
                
                if (docInfo) {
                    // 确保 keywords 数组存在
                    docInfo.keywords = docInfo.keywords || [];
                    if (!docInfo.keywords.includes(keyword)) {
                        docInfo.keywords.push(keyword);
                        documents.set(this.docId, docInfo);
                        localStorage.setItem('documents', JSON.stringify([...documents]));
                        
                        this.renderKeywordsList();
                        keywordInput.value = '';
                        // 重新显示当前文档以更新高亮
                        if (this.currentDoc) {
                            this.displayDocument(this.currentDoc);
                        }
                    }
                }
            }
        };

        keywordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
            }
        });

        addKeywordBtn.addEventListener('click', addKeyword);
    }

    // 修改关键词列表渲染
    renderKeywordsList() {
        const container = document.querySelector('.keywords-list');
        if (!container) return;

        const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
        const docInfo = documents.get(this.docId);
        const keywords = docInfo?.keywords || [];

        container.innerHTML = keywords.map(keyword => `
            <div class="keyword-item">
                <span>${keyword}</span>
                <button class="remove-btn" data-keyword="${keyword}">
                    <span class="material-icons" style="font-size: 14px;">close</span>
                </button>
            </div>
        `).join('');

        // 添加删除事件
        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const keyword = btn.dataset.keyword;
                const documents = new Map(JSON.parse(localStorage.getItem('documents') || '[]'));
                const docInfo = documents.get(this.docId);
                
                if (docInfo && docInfo.keywords) {
                    docInfo.keywords = docInfo.keywords.filter(k => k !== keyword);
                    documents.set(this.docId, docInfo);
                    localStorage.setItem('documents', JSON.stringify([...documents]));
                    
                    this.renderKeywordsList();
                    // 重新显示文档以更新高亮
                    if (this.currentDoc) {
                        this.displayDocument(this.currentDoc);
                    }
                }
            });
        });
    }

    // 更新关键词统计
    updateKeywordStats(keywordMatches) {
        const container = document.getElementById('keywords-container');
        const matchesCount = document.getElementById('keyword-matches');
        if (!container || !matchesCount) return;

        let totalMatches = 0;
        const statsHtml = Array.from(keywordMatches.entries())
            .filter(([_, count]) => count > 0)
            .map(([keyword, count]) => {
                totalMatches += count;
                return `
                    <div class="keyword-stat-item">
                        <span class="keyword-name">${keyword}</span>
                        <span class="keyword-count">${count} 处匹配</span>
                    </div>
                `;
            }).join('');

        container.innerHTML = statsHtml || '<div class="no-matches">未找到关键词匹配</div>';
        matchesCount.textContent = totalMatches;
    }

    initializeEditor() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // 存储编辑器引用
        this.editor = editor;

        // 创建初始内容结构
        if (!editor.firstChild) {
            const firstLine = document.createElement('div');
            firstLine.className = 'editor-line';
            editor.appendChild(firstLine);
        }

        // 处理键盘事件
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const currentLine = this.getCurrentLine();
                
                let currentDiv = range.startContainer;
                while (currentDiv && currentDiv.nodeType !== Node.ELEMENT_NODE) {
                    currentDiv = currentDiv.parentNode;
                }

                // 如果当前行为空
                if (!currentLine.trim()) {
                    // 创建新的空行
                    const newLine = document.createElement('div');
                    newLine.className = 'editor-line';
                    currentDiv.parentNode.insertBefore(newLine, currentDiv.nextSibling);
                    this.setCaretToStart(newLine);
                    return;
                }

                // 检查当前行是否是列表项（包括数字和字母序号）
                const listMatch = currentLine.match(/^(\s*)([a-z\d]+)\.\s*(.*)/i);
                if (listMatch) {
                    const [_, indent, number, content] = listMatch;
                    
                    // 如果当前行是空的，结束当前级别的列表
                    if (!content.trim()) {
                        const newLine = document.createElement('div');
                        newLine.className = 'editor-line';
                        currentDiv.parentNode.insertBefore(newLine, currentDiv.nextSibling);
                        this.setCaretToStart(newLine);
                        return;
                    }

                    // 判断是数字序号还是字母序号
                    const isLetter = /^[a-z]$/i.test(number);
                    
                    if (isLetter) {
                        // 处理字母序号
                        const nextLetter = String.fromCharCode(number.toLowerCase().charCodeAt(0) + 1);
                        const newLine = document.createElement('div');
                        newLine.className = 'editor-line';
                        
                        // 如果超过 'z'，回到 'a'，否则使用下一个字母
                        if (nextLetter > 'z') {
                            newLine.textContent = `${indent}a. `;
                        } else {
                            newLine.textContent = `${indent}${nextLetter}. `;
                        }
                        
                        currentDiv.parentNode.insertBefore(newLine, currentDiv.nextSibling);
                        this.setCaretToEnd(newLine);
                    } else {
                        // 处理数字序号
                        // 查找当前列表的最大序号
                        let maxNumber = parseInt(number);
                        let prevDiv = currentDiv;
                        while (prevDiv) {
                            const prevText = prevDiv.textContent || '';
                            const prevMatch = prevText.match(new RegExp(`^${indent}(\\d+)\\.\\s*`));
                            if (prevMatch) {
                                maxNumber = Math.max(maxNumber, parseInt(prevMatch[1]));
                            }
                            prevDiv = prevDiv.previousElementSibling;
                        }

                        // 创建下一个列表项
                        const nextNumber = maxNumber + 1;
                        const newLine = document.createElement('div');
                        newLine.className = 'editor-line';
                        newLine.textContent = `${indent}${nextNumber}. `;
                        currentDiv.parentNode.insertBefore(newLine, currentDiv.nextSibling);
                        this.setCaretToEnd(newLine);
                    }
                } else {
                    // 如果不是列表项，创建新的一级列表
                    const newLine = document.createElement('div');
                    newLine.className = 'editor-line';
                    newLine.textContent = '1. ';
                    currentDiv.parentNode.insertBefore(newLine, currentDiv.nextSibling);
                    this.setCaretToEnd(newLine);
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const currentLine = this.getCurrentLine();
                let currentDiv = range.startContainer;
                while (currentDiv && currentDiv.nodeType !== Node.ELEMENT_NODE) {
                    currentDiv = currentDiv.parentNode;
                }

                // 检查当前行是否是列表项
                const listMatch = currentLine.match(/^(\s*)(\d+|[a-z])\.\s*(.*)/);
                if (listMatch) {
                    const [_, indent, number, content] = listMatch;
                    if (e.shiftKey) {
                        // 减少缩进
                        if (indent.length >= 4) {
                            // 如果是字母序号，转换回数字序号
                            const isLetter = /[a-z]/i.test(number);
                            if (isLetter) {
                                // 查找同级最后一个数字序号
                                let lastNumber = this.findLastNumberAtIndent(currentDiv, indent.length - 4);
                                const newNumber = (lastNumber || 0) + 1;
                                const newLine = `${indent.slice(4)}${newNumber}. ${content}`;
                                currentDiv.textContent = newLine;
                            } else {
                                const newLine = currentLine.slice(4);
                                currentDiv.textContent = newLine;
                            }
                        }
                    } else {
                        // 增加缩进
                        const newIndent = '    '; // 4个空格的缩进
                        const currentContent = currentDiv.textContent;
                        
                        // 查找同级其他字母序号
                        let lastLetter = null;
                        let tempDiv = currentDiv.previousElementSibling;
                        let foundSameLevel = false;

                        while (tempDiv) {
                            const tempText = tempDiv.textContent;
                            const letterMatch = tempText.match(/^(\s*)([a-z])\.\s*/);
                            if (letterMatch && letterMatch[1].length === newIndent.length) {
                                lastLetter = letterMatch[2];
                                foundSameLevel = true;
                                break;
                            }
                            tempDiv = tempDiv.previousElementSibling;
                        }

                        // 确定新的字母序号
                        let newLetter = lastLetter ? 
                            String.fromCharCode(lastLetter.charCodeAt(0) + 1) : 'a';
                        if (newLetter > 'z') newLetter = 'a';

                        // 创建新的缩进行，确保保留原有内容
                        const newLine = `${newIndent}${newLetter}. ${content}`;
                        currentDiv.textContent = newLine;
                    }
                    this.setCaretToEnd(currentDiv);
                }
            } else if (e.key === 'Backspace') {
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const currentLine = this.getCurrentLine();
                let currentDiv = range.startContainer;
                while (currentDiv && currentDiv.nodeType !== Node.ELEMENT_NODE) {
                    currentDiv = currentDiv.parentNode;
                }

                // 检查当前行是否是列表项且光标在行首或序号内
                const listMatch = currentLine.match(/^(\s*)([a-z\d]+)\.\s*(.*)/i);
                if (listMatch) {
                    const [_, indent, number, content] = listMatch;
                    const cursorAtStart = range.startOffset <= (indent + number + '. ').length;
                    
                    // 如果是缩进的子序号且光标在序号区域
                    if (indent.length > 0 && cursorAtStart) {
                        e.preventDefault();
                        
                        // 查找父级序号和同级最后一个数字序号
                        let maxNumber = 0;
                        let prevDiv = currentDiv.previousElementSibling;
                        
                        while (prevDiv) {
                            const prevText = prevDiv.textContent;
                            const numMatch = prevText.match(/^(\d+)\.\s*/);
                            if (numMatch) {
                                maxNumber = Math.max(maxNumber, parseInt(numMatch[1]));
                            }
                            prevDiv = prevDiv.previousElementSibling;
                        }

                        // 创建新的数字序号（最大序号+1）
                        const nextNumber = maxNumber + 1;
                        currentDiv.textContent = `${nextNumber}. ${content}`;
                        
                        // 将光标移动到新序号后
                        const textNode = currentDiv.firstChild;
                        const newOffset = `${nextNumber}. `.length;
                        range.setStart(textNode, newOffset);
                        range.setEnd(textNode, newOffset);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
        });

        // 监听粘贴事件，确保粘贴的是纯文本
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });
    }

    getCurrentLine() {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        let currentDiv = range.startContainer;
        
        // 获取当前行的 div 元素
        while (currentDiv && currentDiv.nodeType !== Node.ELEMENT_NODE) {
            currentDiv = currentDiv.parentNode;
        }
        
        return currentDiv ? currentDiv.textContent : '';
    }

    setCaretToStart(element) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    setCaretToEnd(element) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // 获取子序号类型
    getSubNumberingType(level) {
        const types = ['number', 'letter', 'roman'];
        return types[level % types.length];
    }

    // 获取下一个序号
    getNextNumber(type, lastNumber) {
        switch (type) {
            case 'number':
                return lastNumber ? (parseInt(lastNumber) + 1).toString() : '1';
            case 'letter':
                if (!lastNumber) return 'a';
                const nextChar = String.fromCharCode(lastNumber.charCodeAt(0) + 1);
                return nextChar <= 'z' ? nextChar : 'a';
            case 'roman':
                const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
                const currentIndex = romans.indexOf(lastNumber?.toLowerCase() || '');
                return romans[(currentIndex + 1) % romans.length];
            default:
                return '1';
        }
    }

    // 查找父级序号信息
    findParentNumbering(currentDiv) {
        let prevDiv = currentDiv.previousElementSibling;
        let currentIndent = (currentDiv.textContent.match(/^\s*/) || [''])[0].length;
        
        while (prevDiv) {
            const prevText = prevDiv.textContent;
            const prevMatch = prevText.match(/^(\s*)(\d+|[a-z])(\.|\))/i);
            if (prevMatch) {
                const prevIndent = prevMatch[1].length;
                if (prevIndent < currentIndent) {
                    return {
                        type: this.getSubNumberingType(prevIndent / 4),
                        lastNumber: prevMatch[2]
                    };
                }
            }
            prevDiv = prevDiv.previousElementSibling;
        }
        return { type: 'number', lastNumber: null };
    }

    // 查找同级最后一个序号
    findLastSubNumber(currentDiv, targetIndent) {
        let prevDiv = currentDiv.previousElementSibling;
        while (prevDiv) {
            const prevText = prevDiv.textContent;
            const prevMatch = prevText.match(/^(\s*)(\d+|[a-z])(\.|\))/i);
            if (prevMatch && prevMatch[1].length === targetIndent) {
                return prevMatch[2];
            } else if (prevMatch && prevMatch[1].length < targetIndent) {
                break;
            }
            prevDiv = prevDiv.previousElementSibling;
        }
        return null;
    }

    // 添加新的辅助方法
    findLastNumberAtIndent(currentDiv, targetIndent) {
        let prevDiv = currentDiv.previousElementSibling;
        let lastNumber = 0;
        
        while (prevDiv) {
            const prevText = prevDiv.textContent;
            const match = prevText.match(new RegExp(`^\\s{${targetIndent}}(\\d+)\\.\\s*`));
            if (match) {
                lastNumber = parseInt(match[1]);
            }
            prevDiv = prevDiv.previousElementSibling;
        }
        
        return lastNumber;
    }
}

// 等待 DOM 加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.documentAssistant = new DocumentAssistant();
}); 