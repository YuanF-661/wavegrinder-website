# Wave Grinder 网站部署说明（Hostinger）

## 结论

**推荐：纯静态 HTML + Hostinger Git 自动部署。现阶段不推荐 WordPress。**

网站只有一个页面、三个作品、更新频率低。静态网页最快、最安全，几乎不需要维护。等以后真的需要"非技术成员自己在后台发内容"时，再考虑 WordPress。

---

## 1. 为什么现阶段不推荐 WordPress

| | 静态 HTML（推荐） | WordPress | Hostinger Website Builder |
|---|---|---|---|
| 适合场景 | 单页 / 少量页面，偶尔更新 | 经常发文章、作品、新闻，多人在后台编辑 | 完全不想碰代码 |
| 速度 | 最快 | 依赖主题和插件，通常较慢 | 中等 |
| 安全 / 维护 | 几乎为零 | 需要定期更新核心、主题、插件，否则容易被攻击 | 平台负责 |
| 设计自由度 | 完全可控 | 极简设计常要和主题"较劲"，或依赖 page builder，页面变臃肿 | 受模板限制 |
| 迁移 | 文件拷走即可，换任何主机都能用 | 需要导出数据库 + 文件 | 基本被锁在平台内 |

**什么时候改用 WordPress：**

- 作品数量多（比如 10 个以上），并且要经常新增；
- 团队里不写代码的成员需要自己更新内容；
- 需要博客、新闻、活动页、多语言等功能。

到那一步时，Hostinger 的 hPanel 可以一键安装 WordPress。届时建议选轻量的 block theme，尽量少装插件。

---

## 2. 项目文件结构

```
WG-Website_Nov2026/
├── index.html      ← 整个网站（目前只有这一个文件）
├── DEPLOY.md       ← 本文档
├── .htaccess       ← 阻止外部访问 .git 文件夹和 .md 文档（Git 部署时这些文件也会进 public_html）
├── .gitignore      ← 不进仓库的文件
└── .claude/        ← 本地预览配置，不需要上传（已在 .gitignore 中排除）
```

GitHub 仓库：`YuanF-661/wavegrinder-website`（private），分支 `main`。

以后加图片时，建议新建 `images/` 文件夹，和 `index.html` 放在一起上传。

**本地预览：** 直接双击 `index.html` 用浏览器打开即可；或者在项目目录运行：

```bash
python3 -m http.server 8000
```

然后打开 http://localhost:8000 。

---

## 3. 部署方式（三选一）

> ⚠️ **部署前先确认：** 如果 Hostinger 上这个域名已经有网站（包括自动安装的 WordPress 或默认页面），部署会覆盖 `public_html`。请先在 hPanel 里**备份**现有内容。
>
> Hostinger 后台的菜单名称会随改版变化。找不到某一项时，直接用 hPanel 顶部的搜索框搜关键词（如 "File Manager"、"Git"、"SSL"）。

### 方式 A：文件管理器手动上传（最快，适合第一次上线）

1. 登录 Hostinger → **hPanel** → **Websites** → 选择你的域名 → **Manage**。
2. 打开 **File Manager**，进入 `public_html` 文件夹。
3. 删除里面的默认文件（如 `default.php`，前提是已经备份或确认不需要）。
4. 上传 `index.html`（以后加图片，就连同 `images/` 文件夹一起上传）。
5. 用浏览器访问你的域名，确认页面正常。

以后每次修改，重新上传覆盖 `index.html` 即可。

### 方式 B：GitHub + Hostinger Git 自动部署（推荐长期使用）

改完代码 push 到 GitHub，网站自动更新，同时自带版本历史，改坏了可以随时回退。

1. **把项目放到 GitHub：** 新建一个仓库（可以是 private），把 `index.html` 等文件推上去。
2. **在 hPanel 搜索 "Git"**，打开 Git 部署页面。
3. 填写：
   - **Repository**：仓库地址。public 仓库用 `https://github.com/用户名/仓库名.git`；private 仓库用 SSH 地址 `git@github.com:用户名/仓库名.git`。
   - **Branch**：`main`
   - **Directory**：留空（即部署到 `public_html`）
4. **如果是 private 仓库：** hPanel 的 Git 页面会提供一个 **SSH key**。复制它，到 GitHub 仓库 → **Settings → Deploy keys → Add deploy key** 粘贴保存（只需读取权限）。
5. 注意：**目标目录必须是空的**，否则 Hostinger 会拒绝部署。请先按方式 A 第 3 步清空 `public_html`（记得先备份）。
6. 点击创建，然后点 **Deploy**，访问域名确认。
7. **开启自动部署：** 在 Git 页面找到 **Auto Deployment**，复制 Webhook URL，到 GitHub 仓库 → **Settings → Webhooks → Add webhook**，粘贴到 Payload URL 并保存。之后每次 push 到 `main` 都会自动更新网站。

### 方式 C：FTP

hPanel → 搜索 **FTP Accounts** 查看主机地址、用户名和端口，用 FileZilla 或 Cyberduck 连接，把文件拖进 `public_html`。效果和方式 A 一样，适合习惯用 FTP 客户端的人。

---

## 4. 域名与 HTTPS

- **域名：** 如果域名也在 Hostinger 买的，通常已经自动指向主机。如果域名在别处（GoDaddy、Namecheap 等），需要把 nameserver 改成 Hostinger 提供的地址（hPanel 的域名页面里能看到），生效可能需要几小时到 24 小时。
- **SSL 证书：** hPanel 搜索 **SSL**，为域名安装免费证书，并打开 **Force HTTPS**。

---

## 5. 邮箱

页面上的联系邮箱目前是占位的 `hello@example.com`。Hostinger 主机套餐一般包含域名邮箱：在 hPanel 搜索 **Emails**，创建 `hello@你的域名`，然后替换 `index.html` 里的两处 `hello@example.com`。

**关于联系表单：** 静态网站本身不能处理表单提交。目前用邮箱链接（`mailto:`）最简单可靠。如果以后想要表单，可以用 Formspree 这类第三方服务，或者利用 Hostinger 支持的 PHP 写一个简单的发信脚本。

---

## 6. 上线前检查清单

- [ ] 替换 Practice 的四个方向为真实内容
- [ ] 填写三个作品的年份、形式和一句话描述
- [ ] 替换邮箱地址（`index.html` 里共两处）
- [ ] 填入 Instagram / Vimeo / SoundCloud 真实链接，没有的就删掉
- [ ] 加 favicon（浏览器标签页小图标）
- [ ] 加分享预览图（`og:image`，在社交平台分享链接时显示）
- [ ] 用手机实际打开检查一遍
- [ ] 确认 HTTPS 生效（地址栏有锁形图标）

---

## 7. 之后可以考虑的迭代

1. 每个作品加一张图，点进去有单独的作品页（`works/waves-of-intuition.html` 等）。
2. 首页或作品页加一段可点击播放的音频片段，让声音工作室的网站"能被听到"。
3. 简短的 About / 团队介绍。
4. 内容多起来以后，再评估是否迁移到 WordPress 或其他 CMS。
