/* eslint-disable prettier/prettier */
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  VERIFYING = 'VERIFYING',
  VERIFIED = 'VERIFIED'
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstname: string;

  @Column()
  lastname: string;

  @Column()
  gender: string;

  @Column()
  email: string;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  mobile_no: string;

  @Column()
  country: string;

  @Column({ type:'date', nullable:true})
  dateOfBirth: Date;

  @Column({ default: 0 })
  loginAttempts: number;

  @Column({ nullable: true })
  blockedAt: Date;

  @Column() // Initialize isBlocked to false
  isBlocked: boolean;

  @Column({ default: UserRole.USER })
  role: UserRole;

  @Column({ length: 6 })
  otp: string;

  @Column({ nullable: true, default: null }) // Allow NULL values for otpExpiration
  otpExpiration: Date;

  @Column({ default: () => 'CURRENT_TIMESTAMP' }) // Set default value to current timestamp for otpCreate
  otpCreate: Date;

  @Column()
  status: UserStatus;
}

// @Column('text', { array: true, nullable: true })
// activeTokens: string[];

// @Column()
// token: string;