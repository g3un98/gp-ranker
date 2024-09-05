import { promises as fs } from "fs";
import path from "path";

const MERGED_GLOBAL_NAME = "merged_global.json";
const MERGED_KR_NAME = "merged_kr.json";

interface RawMergedData {
  update_date: string | null;
  package_names: string[];
}

interface MergedData {
  update_date: Date | null;
  package_names: string[];
}

type Data = Record<string, Record<string, string[]>>;

async function fetchMergedData(fileName: string): Promise<MergedData | null> {
  const filePath = path.join(process.cwd(), fileName);

  try {
    await fs.access(filePath);
    const content = await fs.readFile(filePath, "utf-8");
    const rawData: RawMergedData = JSON.parse(content);

    if (
      rawData.update_date === null ||
      (typeof rawData.update_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(rawData.update_date))
    ) {
      if (Array.isArray(rawData.package_names)) {
        const mergedData: MergedData = {
          update_date: rawData.update_date
            ? new Date(rawData.update_date)
            : null,
          package_names: rawData.package_names,
        };

        return mergedData;
      }
    }

    console.error(
      `유효하지 않은 데이터 형식입니다: ${JSON.stringify(rawData)}`,
    );
    return null;
  } catch (err) {
    console.debug("파일이 존재하지 않습니다.");
    const content: MergedData = { update_date: null, package_names: [] };
    try {
      await fs.writeFile(filePath, JSON.stringify(content, null, 2));
      return content;
    } catch (err) {
      console.error(`파일 초기화를 실패했습니다: ${err}`);
      return null;
    }
  }
}

async function getRelevantFolders(updateDate: Date): Promise<string[]> {
  const folders = await fs.readdir(process.cwd(), { withFileTypes: true });
  const dateFolders = folders
    .filter(
      (dirent) =>
        dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dirent.name),
    )
    .map((dirent) => dirent.name);

  if (updateDate == null) {
    return dateFolders;
  } else {
    return dateFolders.filter((folder) => new Date(folder) > updateDate);
  }
}

async function getRelevantJsons(
  folder: string,
  filter: string | null,
): Promise<Data[]> {
  let jsonFiles = await fs.readdir(folder);

  if (filter != null) {
    jsonFiles = jsonFiles.filter((file) => file.includes(filter));
  }

  return await Promise.all(
    jsonFiles.map(async (file) => {
      const content = await fs.readFile(path.join(folder, file), "utf-8");
      return JSON.parse(content);
    }),
  );
}

const uniqueSort = <T>(arr: T[]): T[] => Array.from(new Set(arr)).sort();

async function saveDate(fileName: string, rawData: RawMergedData) {
  try {
    const filePath = path.join(process.cwd(), fileName);
    await fs.writeFile(filePath, JSON.stringify(rawData, null, 2));
  } catch (err) {
    console.error(err);
  }
}

async function mergeData(fileName: string, filter: string | null) {
  const lastData = await fetchMergedData(fileName);

  if (lastData == null) {
    console.error("fetchMergedData의 결과가 null 입니다.");
    return;
  }

  const relevantFolders = await getRelevantFolders(lastData.update_date!);
  console.debug(`releventFolders: ${relevantFolders.length}`);

  const relevantJsons = (
    await Promise.all(
      relevantFolders.map(async (folder) => {
        return await getRelevantJsons(folder, filter);
      }),
    )
  ).flat();
  console.debug(`relevantJsons: ${relevantJsons.length}`);

  const result = relevantJsons.flatMap((j) => {
    return Object.keys(j)
      .filter(
        (category) => !(category.includes("game") || category == "application"),
      )
      .flatMap((category) => j[category]["top_free"] || []);
  });

  let newPackageNames = uniqueSort(lastData.package_names.concat(result));
  let newUpdateDate = relevantFolders.reduce((latest, current) => {
    return new Date(current) > new Date(latest) ? current : latest;
  });

  const rawData: RawMergedData = {
    package_names: newPackageNames,
    update_date: newUpdateDate,
  };

  await saveDate(fileName, rawData);
}

async function main() {
  await mergeData(MERGED_GLOBAL_NAME, null);
  await mergeData(MERGED_KR_NAME, "kr");
}

(async () => {
  main().catch((err) => console.error(err));
})();
