import express, { Express } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { storeData, getData } from './controllers';

dotenv.config();

const PORT = process.env.PORT || 3000;
const app: Express = express();

app.use(helmet());

app.post('/data', storeData);

app.get('/data', getData);

app.listen(PORT, () => console.log(`Running on port ${PORT} ⚡`));
