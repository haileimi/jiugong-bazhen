# Git 速查表（jiugong-bazhen 专用）

> 用途：出门在外、没有 AI 帮忙时，照着这个做就行。

## 一、第一次在新电脑上拿代码

```powershell
cd 你想放代码的文件夹        # 位置随意，比如 D:\projects
git clone https://github.com/haileimi/jiugong-bazhen.git
cd jiugong-bazhen
```

## 二、日常循环（每次改完代码）

```powershell
git add .
git commit -m "这次改了啥"
git push
```

## 三、换电脑开工前 / 同步最新

```powershell
git pull
```

## 四、铁律

- 收工必 push，开工必 pull。
- commit 了不 push 就换电脑 → 两边版本会打架。
- push 想成功，必须先把改动 commit 掉。

## 五、常见问题

| 问题 | 解决 |
|---|---|
| 第一次 push 弹登录窗口 | 浏览器登录 GitHub 一次即可 |
| 提示要输密码 | GitHub 不认密码，去网页生成 Personal Access Token（勾 repo 权限），粘贴当密码 |
| 连不上 GitHub（网络不通） | 项目目录里执行：`git config http.proxy http://127.0.0.1:7897` |
| 敲 git 提示不是命令 | 装 Git for Windows（git-scm.com/download/win），默认安装 |
| 弄乱了想放弃本地改动 | `git checkout -- .`（丢最近未提交改动） |
| 想撤销上一次 commit | `git reset --soft HEAD~1`（保留改动，重新提交） |

## 六、常见词解释

- `add` = 登记本次改动（每次都要做）
- `commit` = 打包成本地版本（在你自己电脑上）
- `push` = 上传到云端 GitHub
- `pull` = 从云端下载最新
- `clone` = 新电脑第一次下载整个仓库（每台电脑只用一次）
