import os from "os";
import path from "path";
import { promises as fs } from "fs";

import gplay from "google-play-scraper";
import iso3166 from "iso-3166-1";
import pLimit from "p-limit";

import ExpandMap from "./util.ts";

const MAX_FETCH_COUNT = 500;
const limit = pLimit(os.cpus().length * 4);

type Result = ExpandMap<string, ExpandMap<string, string[]>>;

async function get_ranking(
  country: string,
  category: gplay.category,
  collection: gplay.collection,
): Promise<string[]> {
  try {
    const apps = await gplay.list({
      country: country,
      category: category,
      collection: collection,
      num: MAX_FETCH_COUNT,
    });

    return apps.map((app) => app.appId);
  } catch (_) {
    return [];
  }
}

async function processCollection(
  result: Result,
  country: string,
  category: gplay.category,
  collection: gplay.collection,
) {
  const ranking = await limit(() => get_ranking(country, category, collection));
  if (ranking.length > 0) {
    result
      .getOr(category.toLocaleLowerCase(), new ExpandMap())
      .set(collection.toLocaleLowerCase(), ranking);
  }
}

async function processCategory(
  result: Result,
  country: string,
  category: gplay.category,
) {
  const collections = Object.values(gplay.collection);
  return Promise.all(
    collections.map((collection) =>
      processCollection(result, country, category, collection),
    ),
  );
}

async function processCountry(country: string): Promise<Result> {
  const result: Result = new ExpandMap();

  const categories = Object.values(gplay.category);
  await Promise.all(
    categories.map((category) => processCategory(result, country, category)),
  );

  return result;
}

function sortResult(result: Result): Result {
  const sortedResult = new ExpandMap();

  Object.values(gplay.category).forEach((category) => {
    const cat = category.toLocaleLowerCase();
    Object.values(gplay.collection).forEach((collection) => {
      const col = collection.toLocaleLowerCase();
      if (result.has(cat) && result.get(cat).has(col))
        sortedResult
          .getOr(cat, new ExpandMap())
          .set(col, result.get(cat).get(col));
    });
  });

  return sortedResult;
}

async function main() {
  const date = new Date().toISOString().split("T")[0];
  const folderPath = path.join(__dirname, date);
  await fs.mkdir(folderPath, { recursive: true });

  const countries = iso3166.all().map((country) => country.alpha2);

  await Promise.all(
    countries.map(async (country) => {
      const result: Result = await processCountry(country);
      const sortedResult = sortResult(result);
      const filePath = path.join(
        folderPath,
        `${date.replaceAll("-", "_")}_${country.toLocaleLowerCase()}.json`,
      );
      await fs.writeFile(
        filePath,
        JSON.stringify(sortedResult.toObject(), null, 2),
      );
    }),
  );
}

(async () => {
  main().catch((err) => console.error(err));
})();
