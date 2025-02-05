class DocumentManager {
    constructor() {
        console.log('DocumentManager 初始化');
        this.checkLeanCloudInit();
        // 等待 DOM 加载完成后再初始化事件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('开始初始化');
        this.initializeEventListeners();
        this.loadDocuments();
    }

    checkLeanCloudInit() {
        if (!AV) {
            console.error('LeanCloud SDK 未加载');
            return;
        }
        console.log('LeanCloud SDK 已加载');
    }

    initializeEventListeners() {
        console.log('初始化事件监听器');
        
        // 直接给创建按钮添加事件监听
        const createBtn = document.getElementById('create-doc');
        if (createBtn) {
            console.log('找到创建按钮，添加事件监听器');
            
            createBtn.onclick = async (e) => {
                console.log('创建按钮被点击（直接事件）');
                e.preventDefault();
                e.stopPropagation();
                await this.handleCreateDocument(e);
            };
        } else {
            console.error('未找到创建按钮');
        }

        // 添加退出登录按钮事件
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                try {
                    await AV.User.logOut();
                    console.log('退出登录成功');
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error('退出登录失败:', error);
                    alert('退出登录失败，请重试');
                }
            };
        }
    }

    async handleCreateDocument(e) {
        const btn = e.currentTarget;
        console.log('开始处理文档创建');
        
        if (btn.disabled) {
            console.log('按钮已禁用，跳过处理');
            return;
        }
        
        try {
            // 禁用按钮
            btn.disabled = true;
            console.log('按钮已禁用');
            
            // 创建文档
            console.log('开始创建文档流程');
            const date = new Date();
            const defaultName = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_思考文档`;
            
            // 创建 LeanCloud 对象
            const Document = AV.Object.extend('Document');
            const doc = new Document();
            
            doc.set({
                title: defaultName,
                content: '',
                keywords: [],
                files: [],
                user: AV.User.current()
            });

            console.log('准备保存文档');
            const result = await doc.save();
            console.log('文档创建成功:', result);
            console.log('文档ID:', result.id);

            // 构建跳转 URL
            const targetUrl = `index.html?docId=${result.id}`;
            console.log('准备跳转到:', targetUrl);

            // 强制跳转
            window.location.replace(targetUrl);
            
        } catch (error) {
            console.error('创建文档失败:', error);
            alert('创建文档失败，请重试');
        } finally {
            // 恢复按钮状态
            btn.disabled = false;
            console.log('按钮已恢复');
        }
    }

    async loadDocuments() {
        try {
            // 检查用户是否登录
            const currentUser = AV.User.current();
            if (!currentUser) {
                window.location.href = 'login.html';
                return;
            }

            // 从 LeanCloud 查询当前用户的文档
            const query = new AV.Query('Document');
            query.equalTo('user', currentUser); // 只查询当前用户的文档
            query.descending('updatedAt');
            const documents = await query.find();
            
            this.renderDocumentList(documents);
        } catch (error) {
            console.error('加载文档失败:', error);
            alert('加载文档失败，请刷新页面重试');
        }
    }

    renderDocumentList(documents) {
        const container = document.querySelector('.document-list');
        if (!container) return;

        container.innerHTML = documents.map(doc => `
            <div class="document-card" data-id="${doc.id}">
                <div class="document-info">
                    <h3 class="doc-title" contenteditable="true" data-id="${doc.id}">${doc.get('title') || '未命名文档'}</h3>
                    <div class="document-meta">
                        <span>创建时间：${doc.createdAt.toLocaleString()}</span>
                        <span>更新时间：${doc.updatedAt.toLocaleString()}</span>
                    </div>
                </div>
                <div class="document-actions">
                    <button class="action-btn edit-btn" data-id="${doc.id}">
                        <span class="material-icons">edit</span>
                    </button>
                    <button class="action-btn delete-btn" data-id="${doc.id}">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            </div>
        `).join('');

        this.addCardListeners();
    }

    addCardListeners() {
        // 编辑按钮
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.dataset.id;
                window.location.href = `index.html?docId=${docId}`;
            });
        });

        // 删除按钮
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('确定要删除这个文档吗？')) {
                    const docId = e.currentTarget.dataset.id;
                    try {
                        const doc = AV.Object.createWithoutData('Document', docId);
                        await doc.destroy();
                        await this.loadDocuments();
                    } catch (error) {
                        console.error('删除文档失败:', error);
                        alert('删除文档失败，请重试');
                    }
                }
            });
        });

        // 添加标题编辑功能
        document.querySelectorAll('.doc-title').forEach(titleElement => {
            // 失去焦点时保存
            titleElement.addEventListener('blur', async (e) => {
                const docId = e.target.dataset.id;
                const newTitle = e.target.textContent.trim();
                
                try {
                    const doc = AV.Object.createWithoutData('Document', docId);
                    doc.set('title', newTitle);
                    await doc.save();
                    console.log('标题更新成功');
                } catch (error) {
                    console.error('更新标题失败:', error);
                    alert('更新标题失败，请重试');
                    // 恢复原标题
                    await this.loadDocuments();
                }
            });

            // 按下回车键时保存
            titleElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
            });
        });
    }
}

// 初始化
const manager = new DocumentManager();

// 添加全局错误处理
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('全局错误:', {
        message: msg,
        url: url,
        lineNo: lineNo,
        columnNo: columnNo,
        error: error
    });
    return false;
}; 