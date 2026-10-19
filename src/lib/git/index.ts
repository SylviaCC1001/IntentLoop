/**
 * Git 版本管理服务 - 用 isomorphic-git 实现,无需安装 git
 * 每个文档对应一个 bare repo: ./data/repos/{docId}.git
 */
import git from "isomorphic-git";
import fs from "fs";
import path from "path";

function getRepoDir(dataDir: string, docId: string): string {
  return path.join(dataDir, "repos", docId);
}

/**
 * 初始化文档对应的 git 仓库(每个文档一个非 bare repo)
 */
export async function initRepo(dataDir: string, docId: string): Promise<void> {
  const dir = getRepoDir(dataDir, docId);
  if (fs.existsSync(path.join(dir, ".git"))) {
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  await git.init({ fs, dir, defaultBranch: "main" });
}

/**
 * 创建一个新提交
 * @param docId 文档 id
 * @param files 要写入的文件 {相对路径: 内容}
 * @param message commit message
 * @param author 作者
 */
export async function commit(
  dataDir: string,
  docId: string,
  files: Record<string, string | Buffer>,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  const dir = getRepoDir(dataDir, docId);
  await initRepo(dataDir, docId);

  // 写入文件
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content as Buffer | string);
    await git.add({ fs, dir, filepath: relPath });
  }

  const sha = await git.commit({
    fs,
    dir,
    author,
    message,
  });

  return sha;
}

/**
 * 读取某个 commit 中的文件
 */
export async function readFileAt(
  dataDir: string,
  docId: string,
  sha: string,
  filepath: string
): Promise<string | null> {
  const dir = getRepoDir(dataDir, docId);
  try {
    const { blob } = await git.readBlob({ fs, dir, oid: sha, filepath });
    return Buffer.from(blob).toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * 列出所有 commit
 */
export async function log(dataDir: string, docId: string, depth = 50) {
  const dir = getRepoDir(dataDir, docId);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    return [];
  }
  return git.log({ fs, dir, depth });
}
