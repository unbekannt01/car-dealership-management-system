/* eslint-disable prettier/prettier */
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, } from 'typeorm';

@Entity()
export class Car {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  carBrand: string;

  @Column()
  carModel: string;

  @Column()
  manufacturing_year: number;

  @Column()
  price: number;

  @Column()
  color: string;

  @Column({ default: true })
  isAvailableForSale: boolean;

  @Column({ type: 'json', nullable: true })
  spareParts: { part: string; needsReplacement: boolean }[];

  @Column()
  details: string;

  @Column()
  previousOwnerId: string;

  @Column()
  currentOwnerId: string;

  @Column()
  currentOwnerType: 'user' | 'dealer';

  @Column()
  status: 'for_sale' | 'sold';

  message: string

  @Column({ default: false })
  availableForTestDrive: boolean;

  @Column({ default: 'KP Group' })
  dealerName: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
