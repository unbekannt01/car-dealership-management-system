/* eslint-disable prettier/prettier */
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Car } from "./car.entity";

@Entity()
export class CarTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Car)
    car: Car;

    @Column()
    sellerId: string;

    @Column()
    sellerType: 'user' | 'dealer';

    @Column()
    buyerId: string;

    @Column()
    sellerEmail: string;

    @Column()
    buyerEmail: string;

    @Column()
    buyerType: 'user' | 'dealer';

    @Column()
    transactionType: 'buy' | 'sell';

    @Column()
    price: number;

    @Column({ default: () => 'CURRENT_TIMESTAMP' })
    transactionDateTime: Date;
}