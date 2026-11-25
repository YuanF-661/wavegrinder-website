# 手把手：把网站从 GitHub 部署到 Hostinger

本指南对应仓库：**https://github.com/YuanF-661/wavegrinder-website**（public，分支 `main`）

做完以后：每次把修改推送（push）到 GitHub，Hostinger 会自动更新网站，不需要再手动上传文件。

全程大约 10–15 分钟。

> 💡 Hostinger 后台（hPanel）的界面是英文的，下面的按钮名称都按英文原文写。Hostinger 偶尔会改版，如果某个按钮位置不一样，可以用 hPanel 顶部的搜索框搜索关键词（比如 "Git"）。
>
> 依据的官方文档：[Git – Hostinger Docs](https://docs.hostinger.com/websites/git)、[How to deploy a website from GitHub or GitLab in Hostinger](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/)

---

## 第 0 步：准备

你需要：

- [ ] Hostinger 账号，已购买**网页主机（Web Hosting）或云主机（Cloud Hosting）**套餐，并且已经添加了你的域名
- [ ] GitHub 账号 `YuanF-661` 能正常登录（中间要授权一次）

> Git 部署只支持 PHP / HTML 类型的网站，我们的网站是纯 HTML，符合条件。用 Hostinger AI Builder 做的网站不支持这个功能。

---

## 第 1 步：备份现有网站（重要）

**部署时，Hostinger 会用仓库里的文件替换 `public_html` 里的内容。** 如果这个域名下已经有网站，比如自动安装的 WordPress 或者旧网站，先备份。

1. 登录 [hpanel.hostinger.com](https://hpanel.hostinger.com)
2. 点左侧 **Websites**，找到你的域名，点 **Manage**
3. 在左侧菜单找到 **Files → File Manager**，打开
4. 进入 `public_html` 文件夹，看看里面有什么：
   - **只有一个 `default.php`**，或者是空的：这是 Hostinger 的默认页，可以直接删掉，跳到第 2 步
   - **有其他内容**（比如很多 `wp-` 开头的文件，说明装过 WordPress）：先全选，点右键 **Compress**（压缩）生成一个 zip，再右键 **Download** 下载到电脑上保存
5. 备份完成后，删除 `public_html` 里的所有文件（下载的 zip 留在电脑上，不用放回去）

> 为什么要清空？Hostinger 的旧版部署方式明确要求目标文件夹必须为空，新版没有写明。清空能避免旧文件残留，最稳妥。

---

## 第 2 步：打开 Git 设置页

1. 回到这个网站的管理页（**Websites → 你的域名 → Manage**）
2. 在左侧菜单找到 **Advanced → Git**
   - 找不到的话，在顶部搜索框搜 `Git`

---

## 第 3 步：连接 GitHub

1. 点 **Connect with GitHub**
2. 会弹出 GitHub 的授权窗口（如果没弹出来，检查浏览器有没有拦截弹窗），要求安装 **Hostinger 的 GitHub App**
3. 登录 GitHub 账号 `YuanF-661`
4. 选择授予权限的仓库时，建议选 **Only select repositories**，然后只勾选 `wavegrinder-website`

   > 只授权这一个仓库最安全。以后其他网站也要用的话，再回来加。

5. 点 **Install**（或 **Install & Authorize**）完成授权，回到 hPanel

---

## 第 4 步：选择仓库和部署设置

回到 hPanel 后：

1. 在仓库列表里选 **wavegrinder-website**，点 **Next**
2. 确认这几项设置：

   | 设置项 | 填什么 |
   |---|---|
   | **Repository** | `YuanF-661/wavegrinder-website`（会自动填好） |
   | **Branch** | `main` |
   | **Deploy directory**（有的页面叫 Root directory） | `public_html`（默认值，**不要改**） |

3. 点 **Deploy**
4. 等几秒到一分钟，状态变成 **Completed** 就是部署好了
5. 点 **Go to dashboard**

> **自动部署默认是打开的**，Hostinger 会自动处理 webhook，你不需要去 GitHub 设置任何东西。所以 GitHub 仓库的 Webhooks 页面是空的也正常。

---

## 第 5 步：检查网站

1. 打开浏览器，访问你的域名，应该能看到 Wave Grinder 的页面
2. **检查隐藏文件是否被挡住**，依次访问下面两个地址，都应该显示 **404 错误页**：
   - `https://你的域名/DEPLOY.md`
   - `https://你的域名/.git/config`

   > 这两个文件也会随仓库部署到服务器上。仓库里的 `.htaccess` 负责挡住外部访问。如果访问时能看到文件内容，告诉我，我来调整。

3. 用手机打开一次，确认排版正常

---

## 第 6 步：开启 HTTPS（如果还没开）

1. 在网站管理页的顶部搜索框搜 **SSL**
2. 如果显示 **Active**，就已经好了；如果没有，点 **Install SSL**，选免费证书
3. 打开 **Force HTTPS**，这样访问 `http://` 时会自动跳转到 `https://`

证书生效可能需要几分钟到几小时。

---

## 以后怎么更新网站

在电脑上改好文件后，在项目文件夹里运行：

```bash
git add -A
```

```bash
git commit -m "简单描述改了什么"
```

```bash
git push
```

推送后大约一分钟，网站就会自动更新。也可以直接让 Claude 帮你提交和推送。

**查看部署记录：** hPanel → **Advanced → Git** → **Deployments**（或 **All deployments**），可以看到每次部署的时间、提交和状态。点开某一条能看到完整日志。

**手动重新部署：** 同一页面点 **Redeploy**。

---

## 遇到问题怎么办

| 现象 | 可能原因 / 解决方法 |
|---|---|
| 推送后网站没更新 | ① 确认推送的是 `main` 分支；② 在 **Deployments** 里看最新一次的状态和日志；③ 浏览器强制刷新（Mac：`Cmd + Shift + R`）；④ 如果开了 Hostinger 的缓存（CDN / Cache Manager），清一下缓存 |
| 部署状态显示 failed | 点开那条部署记录看日志，把日志截图发给 Claude |
| Overview 显示 **Repository access missing** | 点 **Manage access**，在 GitHub 里重新勾选 `wavegrinder-website` |
| 访问域名显示 Hostinger 默认页 | `public_html` 里可能还有 `default.php`，在 File Manager 里删掉，然后点 **Redeploy** |
| 访问 `/DEPLOY.md` 能看到内容 | `.htaccess` 没起作用，告诉 Claude |
| 弹窗没出现 / 授权失败 | 允许浏览器弹窗，或者换个浏览器再试 |

还是解决不了的话，联系 Hostinger 客服，并提供：提交 ID（GitHub 上那串 7 位字符，例如 `4ff96fb`）、分支名 `main`、推送的时间。

---

## 附：备用方法（不用 GitHub App）

如果 **Connect with GitHub** 用不了，可以用旧版方式。我们的仓库是 public，所以不需要配置 SSH key：

1. 在 **Advanced → Git** 页面找到用仓库地址手动添加的表单
2. 填写：
   - **Repository**：`https://github.com/YuanF-661/wavegrinder-website.git`
   - **Branch**：`main`
   - **Directory**：留空（表示 `public_html`，并且必须是空文件夹）
3. 点 **Create**，然后在列表里点 **Deploy**
4. 设置自动部署：点 **Auto Deployment**，复制 **Webhook URL** 发给 Claude，Claude 会帮你加到 GitHub 仓库上
