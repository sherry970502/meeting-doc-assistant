class DocumentManager {
    constructor() {
        this.documents = new Map();
        this.loadDocuments();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const createBtn = document.getElementById('create-doc');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createNewDocument());
        }
    }

    loadDocuments() {
        // 从本地存储加载文档列表
        const savedDocs = localStorage.getItem('documents');
        if (savedDocs) {
            this.documents = new Map(JSON.parse(savedDocs));
        }
        this.renderDocumentList();
    }

    saveDocuments() {
        localStorage.setItem('documents', JSON.stringify([...this.documents]));
    }

    createNewDocument() {
        const date = new Date();
        const defaultName = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_思考文档`;
        
        const docId = Date.now().toString();
        const newDoc = {
            id: docId,
            title: defaultName,
            createdAt: date.toISOString(),
            updatedAt: date.toISOString()
        };

        this.documents.set(docId, newDoc);
        this.saveDocuments();
        
        // 打开新文档
        window.location.href = `index.html?docId=${docId}`;
    }

    renderDocumentList() {
        const container = document.querySelector('.document-list');
        if (!container) return;

        container.innerHTML = '';
        
        for (const [id, doc] of this.documents) {
            const card = this.createDocumentCard(doc);
            container.appendChild(card);
        }
    }

    createDocumentCard(doc) {
        const div = document.createElement('div');
        div.className = 'document-card';
        div.dataset.id = doc.id;
        
        const createdDate = new Date(doc.createdAt).toLocaleDateString();
        const updatedDate = new Date(doc.updatedAt).toLocaleDateString();

        div.innerHTML = `
            <div class="document-title">${doc.title}</div>
            <div class="document-meta">
                <div class="document-date">
                    <span class="material-icons">event</span>
                    ${createdDate}
                </div>
                <div class="document-date">
                    <span class="material-icons">update</span>
                    ${updatedDate}
                </div>
            </div>
        `;

        div.addEventListener('click', () => {
            window.location.href = `index.html?docId=${doc.id}`;
        });

        return div;
    }
}

// 初始化文档管理器
document.addEventListener('DOMContentLoaded', () => {
    window.documentManager = new DocumentManager();
}); 