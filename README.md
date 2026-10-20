# 礼品管家（线上版）

客户 / 厂家 / 产品 SKU / 报价，手机和电脑都能开，数据存在云端。

- 打开网址 → 用账号密码登录 → 直接就是同一份数据
- 安卓/iOS 浏览器「添加到主屏幕」，用起来跟 App 一样
- 数据在 Supabase（`gift_` 开头 6 张表），只有登录后才能读写

## 技术

纯静态：`index.html` + `style.css` + `app.js`，没有构建、没有依赖。
数据层直连 Supabase REST 和 Auth（`app.js` 顶部的 `SUPA` 常量）。
托管在 GitHub Pages。

## 改法

改完推 main，GitHub Pages 自动重新发布，一两分钟生效。
