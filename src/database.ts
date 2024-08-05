import { DataEntry, ParamTypes } from "./types";

const database: Record<string, Record<string, Omit<DataEntry, 'param'>>> = {};

export const addReading = (collection: ParamTypes, key: string, reading: Omit<DataEntry, 'param'>): Omit<DataEntry, 'param'> => {
  if (database[collection]) {
    database[collection][key] = reading;
  } else {
    database[collection] = { [key]: reading };
  }
  return reading;
};

export const addReadings = (collection: ParamTypes, bulk: { key: string, reading: Omit<DataEntry, 'param'> }[]) => {

  if (!database[collection]) {
    database[collection] = {};
  }

  bulk.forEach(({ key, reading }) => {
    database[collection][key] = reading
  })

  return bulk;
};

export const getReading = (collection: ParamTypes, key: string): Omit<DataEntry, 'param'> | undefined =>
  database[collection] ? database[collection][key] : undefined

export const getReadings = (collection: ParamTypes, filter: (el: Omit<DataEntry, 'param'>) => boolean): Omit<DataEntry, 'param'>[] => {
  return Object.values(database[collection]).filter(filter)
}

