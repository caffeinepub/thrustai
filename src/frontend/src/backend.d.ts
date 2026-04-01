import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Message {
    userMessage: string;
    timestamp: bigint;
    aiResponse: string;
}
export interface PerformanceResults {
    TSFC: number;
    fuelFlowRate: number;
    propulsiveEfficiency: number;
    overallEfficiency: number;
    thermalEfficiency: number;
    netThrust: number;
    specificThrust: number;
}
export interface EngineConfig {
    exitArea: number;
    fanPressureRatio: number;
    compressorEfficiency: number;
    exhaustVelocity: number;
    name: string;
    bypassRatio: number;
    overallPressureRatio: number;
    ambientPressure: number;
    flightSpeed: number;
    exhaustPressure: number;
    massFlow: number;
    turbineInletTemp: number;
    turbineEfficiency: number;
}
export interface backendInterface {
    addChatSession(sessionId: string): Promise<void>;
    addMessage(sessionId: string, userMessage: string, aiResponse: string): Promise<void>;
    calculatePerformance(config: EngineConfig): Promise<PerformanceResults>;
    deleteChatSession(sessionId: string): Promise<void>;
    deleteConfig(name: string): Promise<void>;
    getAllChatSessions(): Promise<Array<string>>;
    getChatHistory(sessionId: string): Promise<Array<Message>>;
    getPerformance(name: string): Promise<PerformanceResults>;
    listConfigs(): Promise<Array<string>>;
    loadConfig(name: string): Promise<EngineConfig>;
    saveConfig(config: EngineConfig): Promise<void>;
    savePerformance(name: string, results: PerformanceResults): Promise<void>;
}
