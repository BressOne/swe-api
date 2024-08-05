export enum ParamTypes {
    Voltage = 'Voltage',
    Current = 'Current',

}

export type DataEntry = { time: number, param: ParamTypes, value: number }
