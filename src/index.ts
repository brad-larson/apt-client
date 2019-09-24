import { version_cmp } from './version_cmp';
import { PkgInfo, PkgSpec, readAptSource, SrcPkgInfo, BinPkgInfo } from './aptreader';

export { PkgInfo, PkgSpec };
export class AptClient {
  private bin_pkgs = new Map<string, [BinPkgInfo, ArrayBuffer | null]>();
  private src_pkgs = new Map<string, [SrcPkgInfo, { [key: string]: ArrayBuffer } | null]>();

  constructor(private arch: string, private sources: string[] = []) { }

  public async update(sources = this.sources) {
    const { bin_pkgs, src_pkgs, arch } = this;
    bin_pkgs.clear();
    src_pkgs.clear();
    await Promise.all(sources.map(async s => {
      for (const pkg of await readAptSource(s, arch)) {
        (pkg.type === 'bin' ? bin_pkgs : src_pkgs).set(pkg.Package, [ pkg as any, null ]);
      }
    }));
  }

  public async getPkgInfo(pkgNames: string[]) {
    const bin_info: Map<string, BinPkgInfo> = new Map();
    const src_info: Map<string, SrcPkgInfo> = new Map();
    const { bin_pkgs, src_pkgs } = this;

    for (const name of pkgNames) {
      let data: [PkgInfo, any] | undefined;
      
      data = bin_pkgs.get(name);
      if (data) {
        bin_info.set(name, data[0] as BinPkgInfo);
      }

      data = src_pkgs.get(name);
      if (data) {
        src_info.set(name, data[0] as SrcPkgInfo);
      } 
    }

    return { bin: bin_info, src: src_info };
  }

  public async getBinFiles(pkgNames: string[]) {
    const files: Map<string, ArrayBuffer> = new Map();
    const { bin_pkgs } = this;

    for (const name of pkgNames) {
      const data = bin_pkgs.get(name);
      if (data) {
        const info = data[0];
        if (!data[1]) {
          const res = await fetch(`${ info.RepoBase }/${ info.Filename }`);
          data[1] = await res.arrayBuffer();
        }
        files.set(name, data[1] as ArrayBuffer);
      } 
    }

    return files;
  }

  public async getSrcFiles(pkgNames: string[]) {
    const files: Map<string, { [key: string]: ArrayBuffer }> = new Map();
    const { src_pkgs } = this;

    for (const name of pkgNames) {
      const data = src_pkgs.get(name);
      if (data) {
        const info = data[0];
        if (!data[1]) {
          const obj = {} as { [key: string]: ArrayBuffer };
          for (const { name } of info.Files) {
            const res = await fetch(`${ info.RepoBase }/${ info.Directory }/${ name }`);
            obj[name] = await res.arrayBuffer();
          }
          data[1] = obj;
        }
        files.set(name, data[1]);
      } 
    }

    return files;
  }

  public isLatest(pkgName: string, version: string) {
    const data = this.bin_pkgs.get(pkgName) || this.src_pkgs.get(pkgName);
    if (!data) return true;
    return version_cmp(data[0].Version, version) < 1;
  }

  public static cmpVersions = version_cmp;
}