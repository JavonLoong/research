# GitHub Pages 发布说明

这个文件夹已经整理成一个纯静态 GitHub Pages 站点：

- `index.html`：网页版入口页。
- `步步_教师端_备课工作台.html`：教师端原型。
- `步步_学生端_平板.html`：学生端原型。
- `步步_白板端_大屏.html`：白板端原型。
- `步步教师新版产品设计_对抗式分析版.md` / `步步教师工作流与产品嵌入设计.txt` / `步步教师工作流与产品嵌入设计.tex`：配套文档源文件。
- `.nojekyll`：让 GitHub Pages 按静态文件原样发布。

## 推荐发布方法

1. 新建或打开 GitHub Pages 仓库。
2. 将本文件夹内的所有文件放到仓库根目录，或者放到仓库的 `docs/` 目录。
3. 在 GitHub 仓库里进入 `Settings -> Pages`。
4. Source 选择 `Deploy from a branch`，Branch 选择对应分支，目录选择 `/` 或 `/docs`。
5. 发布完成后访问：

```text
https://你的用户名.github.io/仓库名/
```

如果这是 `你的用户名.github.io` 这个特殊仓库，访问地址通常是：

```text
https://你的用户名.github.io/
```

## 保留在当前仓库内的访问方式

如果整个 `step_by_step` 仓库已经启用 GitHub Pages，且不移动本文件夹，也可以通过这个路径访问：

```text
https://你的用户名.github.io/step_by_step/交付物/文件夹一/
```

不过为了避免中文路径在分享时被浏览器转义，正式对外展示更推荐把本文件夹内容复制到 Pages 发布目录根部。
