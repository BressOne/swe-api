import { addReadings, getReadings } from './database';
import { Writable } from 'stream';
import { DataEntry, ParamTypes } from './types';
import { Request, Response } from 'express';

const msInSecond = 1000

const validateAndRefineRowData = (row: string[]): { ok: false, reason: string[] } | { ok: true, data: DataEntry } => {
    const rejectionReasons: string[] = []
    const param = row.find(el => Object.values(ParamTypes).some(param => param === el))
    const time = row.find(el => /\d{10}/.test(el))
    const value = row.find(el => /\d{1,}\.\d{1,}/.test(el))
    if (!time) {
        rejectionReasons.push(`find no time: ${row.join(' ')}`)
    }
    if (!value) {
        rejectionReasons.push(`find no value: ${row.join(' ')}`)
    }
    if (!param) {
        rejectionReasons.push(`unrecognized param in row: ${row.join(' ')}`)
    }

    if (rejectionReasons.length) {
        return {
            ok: false,
            reason: rejectionReasons
        }

    } else {
        return {
            ok: true,
            data: {
                time: Number.parseInt(time),
                value: Number.parseFloat(value),
                param: param as ParamTypes
            }
        }
    }

}

class DbStreamWritable extends Writable {
    private processorFunction: (data: DataEntry[],) => Promise<void>;
    constructor({
        processorFn,
        ...options
    }: {
        processorFn: (data: DataEntry[],) => Promise<void>;
    } & Record<string, any>) {
        super(options);
        this.processorFunction = processorFn;
    }
    async _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error) => void,
    ): Promise<void> {
        try {
            const rows = chunk.toString().split('\n')
            const rowValues = rows.map(el => el.split(' '))
            const refinedRows = rowValues.map(validateAndRefineRowData)
            await this.processorFunction(refinedRows.filter(rr => rr.ok).map(({ data }) => data));
            callback(null);
        } catch (error) {
            console.error(error);
            callback(null);
        }
    }
}

export const storeData = (req: Request, res: Response) => {
    if (req.is('text/plain')) {
        const processorFn = async (data: DataEntry[]) => {
            const collections: { [key in ParamTypes]: { key: number, reading: Omit<DataEntry, 'param'> }[] } = { Voltage: [], Current: [] }
            data.forEach(({ time, value, param }) => {
                if (collections[param]) {
                    collections[param].push({ key: time, reading: { value, time } })
                } else {
                    collections[param] = [{ key: time, reading: { value, time } }]
                }
            })
            await Promise.all(Object.keys(collections).map(collection => {
                addReadings(collection as ParamTypes, collections[collection])
            }))
        }
        const writable = new DbStreamWritable({ processorFn })
        req.pipe(writable)
            .on('finish', () => {
                res.status(200).json({ success: true })
            })
            .on('error', (err: Error) => {
                res.status(500).json({ success: false })
            })



    } else {
        res.status(400).send('Invalid content type');
    }
};

const getPower = ({ current, voltage }: {
    current: Omit<DataEntry, "param">[], voltage: Omit<DataEntry, "param">[]
}) => {
    const days = {};
    current.forEach((el: Omit<DataEntry, 'param'>) => {
        const day = new Date(el.time * msInSecond)
        day.setUTCHours(0, 0, 0, 0);
        const dayStart = day.toISOString()
        if (days[dayStart]) {
            if (days[dayStart][ParamTypes.Current]) {
                days[dayStart][ParamTypes.Current].push(el)
            } else {
                days[dayStart][ParamTypes.Current] = [el]
            }
        } else {
            days[dayStart] = { [ParamTypes.Current]: [el] }
        }
    });
    voltage.forEach((el: Omit<DataEntry, 'param'>) => {
        const day = new Date(el.time * msInSecond)
        day.setUTCHours(0, 0, 0, 0);
        const dayStart = day.toISOString()
        if (days[dayStart]) {
            if (days[dayStart][ParamTypes.Voltage]) {
                days[dayStart][ParamTypes.Voltage].push(el)
            } else {
                days[dayStart][ParamTypes.Voltage] = [el]
            }
        } else {
            days[dayStart] = { [ParamTypes.Voltage]: [el] }

        }
    });
    const power = [];
    Object.keys(days).forEach(date => {
        const day = days[date]
        const avgVoltage = day[ParamTypes.Voltage]
            && day[ParamTypes.Voltage].length
            && day[ParamTypes.Voltage].reduce((acc, cur) => {
                return acc + cur.value
            }, 0)
            / day[ParamTypes.Voltage].length
        const avgCurrent = day[ParamTypes.Current]
            && day[ParamTypes.Current].length
            && day[ParamTypes.Current].reduce((acc, cur) => acc + cur.value, 0)
            / day[ParamTypes.Current].length
        if (avgCurrent && avgVoltage) {
            power.push({
                time: new Date(date).toISOString(),
                "name": "Power",
                "value": (avgCurrent * avgVoltage).toFixed(2)
            })
        }
    })
    return power
}

export const getData = async (req: Request, res: Response) => {
    const [start, end] = [Math.floor(new Date(req.query.from as string).getTime() / msInSecond), Math.floor(new Date(req.query.to as string).getTime() / msInSecond)];

    const current = getReadings(ParamTypes.Current, ({ time }) => time > start && time < end)
    const voltage = getReadings(ParamTypes.Voltage, ({ time }) => time > start && time < end)
    const power = getPower({ current, voltage })

    return res.json([...current.map(el => ({ ...el, time: new Date(el.time).toISOString() })), ...voltage.map(el => ({ ...el, time: new Date(el.time).toISOString() })), ...power]);
};