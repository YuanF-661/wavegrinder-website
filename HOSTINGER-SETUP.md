# 手把手：删掉旧 WordPress，换成 GitHub 部署的新网站

本指南对应仓库：**https://github.com/YuanF-661/wavegrinder-website**（public，分支 `main`）

**适用情况：** 这个域名现在在 Hostinger 上跑着一个 WordPress 网站，你想把它全部删掉，换成 GitHub 上的新版本。

做完以后：每次把修改推送（push）到 GitHub，Hostinger 会自动更新网站，不需要再手动上传文件，也不用再管 WordPress 的更新和插件。

全程大约 20–30 分钟。

> 💡 Hostinger 后台（hPanel）的界面是英文的，下面的按钮名称都按英文原文写。Hostinger 经常改版，如果某个按钮位置不一样，可以用 hPanel 顶部的搜索框搜索关键词（比如 "Backups"、"Git"、"Databases"）。

---

## 流程总览

| 步骤 | 做什么 | 能否撤销 |
|---|---|---|
| 1 | 备份旧 WordPress（文件 + 数据库），下载到电脑 | — |
| 2 | 记下 WordPress 用的数据库名 | — |
| 3 | 清空 `public_html`，删除 WordPress 文件 | ❌ 不可撤销（靠第 1 步的备份兜底） |
| 4 | 删除 WordPress 数据库 | ❌ 不可撤销（靠第 1 步的备份兜底） |
| 5 | 连接 GitHub 并部署新网站 | ✅ |
| 6 | 清缓存、检查网站 | ✅ |
| 7 | 确认 HTTPS | ✅ |

**全程不要动的东西：** 域名（Domains）、DNS 设置、邮箱（Emails）。它们和网站文件是分开的，换网站不需要改，改了反而可能导致邮箱收不到信。

> ⚠️ **不要用 Websites 列表里的 "Delete site"（删除整个网站）。** 那样会释放绑定的域名，勾选错了还会删掉邮箱，删完还要重新添加网站。我们只删 WordPress 的**内容**，网站本身保留。

---

## 第 1 步：备份旧 WordPress（必须做）

虽然你不打算再用旧网站，**也一定要先备份**。原因有两个：

- 第 3、4 步删掉的东西无法恢复。万一出了问题，或者以后想找回某段文字、某张图，只能靠这个备份。
- Hostinger 自己的自动备份会过期（每日备份只保留 7 天，每周备份保留 6 周），所以要下载一份存在自己电脑上。

### 1a. 下载网站文件

1. 登录 [hpanel.hostinger.com](https://hpanel.hostinger.com)
2. 点左侧 **Websites**，找到你的域名，点 **Manage**
3. 在左侧菜单找到 **Files → Backups**（或者搜索 "Backups"）
4. 找到 **Files backups**（文件备份），选最新的一个，点 **Download**
5. 等待生成后下载，会得到一个 `.tar.gz` 压缩包，存到电脑上一个好找的位置，比如在 `WG-Website_Nov2026` **旁边**（不是里面）新建一个 `old-wordpress-backup` 文件夹

> 🔒 **备份不要放进 `WG-Website_Nov2026` 项目文件夹里。** 这个文件夹会同步到公开的 GitHub 仓库，而数据库备份里有 WordPress 用户的邮箱、密码哈希等信息。`.gitignore` 已经设置了排除备份文件，但放在外面最保险。

> 旧网站的所有图片都在压缩包里的 `wp-content/uploads/` 文件夹中，以后做作品页如果要用旧图，从这里找。

### 1b. 下载数据库

1. 还是在 **Backups** 页面，找到 **Database backups**（数据库备份）
2. 选择 WordPress 用的那个数据库（不确定是哪个的话，先做第 2 步查名字），选最新日期，点 **Download**
3. 会得到一个 `.sql.gz` 文件，和上面的文件放在一起

> 旧网站的所有文字内容（页面、文章）都存在数据库里。

**检查：** 电脑上现在应该有两个文件，一个 `.tar.gz`，一个 `.sql.gz`，而且大小都不是 0。确认之后再往下走。

<details>
<summary>Backups 页面找不到或下载失败？点这里看备用方法</summary>

- **文件：** 打开 **File Manager** → 进入 `public_html` → 全选 → 右键 **Compress** → 生成 zip → 右键 **Download**
- **数据库：** 搜索 **phpMyAdmin** → 进入对应的数据库 → 顶部 **Export** → 点 **Export**（或 **Go**）下载 `.sql` 文件

</details>

---

## 第 2 步：记下 WordPress 用的数据库名

同一个主机套餐里可能有好几个数据库（比如你还有别的网站），所以要先确认 WordPress 用的是哪一个，第 4 步只删这一个。

1. 左侧菜单打开 **Files → File Manager**
2. 进入 `public_html` 文件夹
3. 找到 `wp-config.php`，双击打开（只看，不要改）
4. 找到这一行：

   ```php
   define( 'DB_NAME', 'u123456789_abcd' );
   ```

5. 把引号里的名字（类似 `u123456789_abcd`）**抄下来**
6. 关闭文件，**不要保存任何修改**

---

## 第 3 步：清空 `public_html`（删除 WordPress 文件）

> 开始前确认：第 1 步的两个备份文件已经在你电脑上了。

1. 在 **File Manager** 里进入 `public_html`
2. **显示隐藏文件**：WordPress 会生成 `.htaccess` 这类以点开头的隐藏文件，它们也要删掉。如果列表里看不到 `.htaccess`，在 File Manager 的设置（齿轮图标或右上角菜单）里打开 **Show hidden files**
3. 全选 `public_html` 里的**所有**文件和文件夹（`wp-admin`、`wp-content`、`wp-includes`、`wp-config.php`、`.htaccess`、`index.php` 等）
4. 点 **Delete**，确认删除
5. 如果 File Manager 有回收站（**Trash**），也清空一下
6. **检查：** `public_html` 现在应该是**完全空的**

> 注意只删 `public_html` **里面**的内容，不要删 `public_html` 文件夹本身，也不要动它外面的其他文件夹。

---

## 第 4 步：删除 WordPress 数据库

文件删了，数据库还在，留着没用还占空间，一起删掉。

1. 在网站管理页搜索 **Databases**，打开 **Databases → Management**（有的版本叫 **MySQL Databases**）
2. 在列表里找到**第 2 步抄下来的那个数据库名**
3. 点它右边的 **⋮** 或删除图标 → **Delete**，确认

   > ⚠️ 只删名字完全一致的那一个。其他数据库可能属于别的网站，不要动。

4. 同一行可能还有一个对应的数据库用户（名字通常类似），可以一起删掉

---

## 第 5 步：连接 GitHub 并部署

1. 回到这个网站的管理页（**Websites → 你的域名 → Manage**）
2. 在左侧菜单找到 **Advanced → Git**（找不到的话搜索 `Git`）
3. 点 **Connect with GitHub**
4. 会弹出 GitHub 的授权窗口（没弹出来的话，检查浏览器有没有拦截弹窗），要求安装 **Hostinger 的 GitHub App**：
   - 登录 GitHub 账号 `YuanF-661`
   - 选择授予权限的仓库时，选 **Only select repositories**，只勾选 `wavegrinder-website`
   - 点 **Install**（或 **Install & Authorize**），回到 hPanel
5. 在仓库列表里选 **wavegrinder-website**，点 **Next**
6. 确认设置：

   | 设置项 | 填什么 |
   |---|---|
   | **Repository** | `YuanF-661/wavegrinder-website`（自动填好） |
   | **Branch** | `main` |
   | **Deploy directory**（有的页面叫 Root directory） | `public_html`（默认值，**不要改**） |

7. 点 **Deploy**，等待状态变成 **Completed**
8. 点 **Go to dashboard**

> **自动部署默认是打开的**，Hostinger 会自动处理，你不需要去 GitHub 设置任何东西。GitHub 仓库的 Webhooks 页面是空的也正常。

---

## 第 6 步：清缓存，检查网站

WordPress 网站在 Hostinger 上通常开着缓存，即使文件已经换掉，访客也可能还会看到旧页面。

### 6a. 清缓存

1. 在网站管理页搜索 **Cache**，打开 **Cache Manager**，点 **Purge All**（清除全部）
2. 再搜索 **CDN**，如果显示已开启，点 **Purge cache**（清除 CDN 缓存）
3. 浏览器强制刷新（Mac：`Cmd + Shift + R`），或者用无痕窗口打开

### 6b. 检查

1. 访问你的域名，应该看到新的 Wave Grinder 页面，而不是旧的 WordPress
2. **检查隐藏文件是否被挡住**，依次访问下面两个地址，都应该显示 **404 错误页**：
   - `https://你的域名/DEPLOY.md`
   - `https://你的域名/.git/config`
3. **检查旧 WordPress 是否彻底消失**：访问 `https://你的域名/wp-admin`，应该显示 404，不应该出现 WordPress 登录页
4. 用手机打开一次，确认排版正常

如果有任何一项不对，截图发给 Claude。

---

## 第 7 步：确认 HTTPS

原来的 WordPress 网站应该已经装过 SSL 证书，换网站不影响它。确认一下：

1. 在网站管理页搜索 **SSL**
2. 状态应该是 **Active**；如果不是，点 **Install SSL**，选免费证书
3. 确认 **Force HTTPS** 是打开的

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

- **查看部署记录：** hPanel → **Advanced → Git** → **Deployments**（或 **All deployments**），点开某一条能看到完整日志
- **手动重新部署：** 同一页面点 **Redeploy**

---

## 遇到问题怎么办

| 现象 | 可能原因 / 解决方法 |
|---|---|
| 访问域名还是旧的 WordPress 页面 | 缓存没清干净：按第 6a 步再清一次 Cache Manager 和 CDN，用无痕窗口访问。CDN 缓存有时要几分钟才失效 |
| 左侧菜单里没有 **Advanced → Git** | hPanel 可能把这个网站当作 WordPress 类型来管理。先搜索 "Git" 试试；还是找不到的话，联系 Hostinger 客服，问 "how to enable Git deployment for an existing website that used to run WordPress"。不要自己去删除整个网站 |
| 部署失败，提示目录不为空 | `public_html` 里还有残留文件（常见的是隐藏的 `.htaccess`）。回到第 3 步，打开显示隐藏文件，删干净后点 **Redeploy** |
| 推送后网站没更新 | ① 确认推送的是 `main` 分支；② 在 **Deployments** 里看最新一次的状态和日志；③ 清缓存（第 6a 步） |
| 部署状态显示 failed | 点开那条部署记录看日志，截图发给 Claude |
| Overview 显示 **Repository access missing** | 点 **Manage access**，在 GitHub 里重新勾选 `wavegrinder-website` |
| 访问 `/DEPLOY.md` 能看到内容 | `.htaccess` 没起作用，告诉 Claude |
| 邮箱收不到信 | 换网站不会影响邮箱。检查是否误动了 DNS 或 Emails 设置 |

还是解决不了的话，联系 Hostinger 客服，并提供：提交 ID（GitHub 上那串 7 位字符）、分支名 `main`、推送的时间。

---

## 附 1：旧网站链接怎么办

旧 WordPress 的页面地址（比如 `/about/`、`/projects/xxx/`）删除后都会变成 404。如果这些链接曾经被分享出去，或者已经被 Google 收录，可以让它们自动跳转到新首页。需要的话告诉 Claude，在 `.htaccess` 里加几行就能实现。

Google 搜索结果里的旧页面会在几周内自然更新。

## 附 2：备用部署方法（不用 GitHub App）

如果 **Connect with GitHub** 用不了，可以用旧版方式。我们的仓库是 public，所以不需要配置 SSH key：

1. 在 **Advanced → Git** 页面找到用仓库地址手动添加的表单
2. 填写：
   - **Repository**：`https://github.com/YuanF-661/wavegrinder-website.git`
   - **Branch**：`main`
   - **Directory**：留空（表示 `public_html`，必须是空文件夹）
3. 点 **Create**，然后在列表里点 **Deploy**
4. 设置自动部署：点 **Auto Deployment**，复制 **Webhook URL** 发给 Claude，Claude 会帮你加到 GitHub 仓库上

---

## 参考的 Hostinger 官方文档

- [Git – Hostinger Docs](https://docs.hostinger.com/websites/git)
- [How to deploy a website from GitHub or GitLab in Hostinger](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/)
- [How to download backups at Hostinger](https://www.hostinger.com/support/5981435-how-to-download-backups-at-hostinger/)
- [Backups – Hostinger Docs](https://docs.hostinger.com/websites/backups)
- [How to delete a website from a Hostinger hosting plan](https://www.hostinger.com/support/3624731-how-to-delete-a-website-from-a-hosting-plan-in-hostinger/)（本指南**不**采用这个方法，仅供参考）
- [How to Delete a WordPress Site: A Complete Guide](https://www.hostinger.com/my/tutorials/wordpress/how-to-delete-wordpress)
