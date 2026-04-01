import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Time "mo:core/Time";
import Runtime "mo:core/Runtime";


actor {
  public type EngineConfig = {
    name : Text;
    massFlow : Float;
    exhaustVelocity : Float;
    flightSpeed : Float;
    exhaustPressure : Float;
    ambientPressure : Float;
    exitArea : Float;
    bypassRatio : Float;
    overallPressureRatio : Float;
    turbineInletTemp : Float;
    fanPressureRatio : Float;
    compressorEfficiency : Float;
    turbineEfficiency : Float;
  };

  public type PerformanceResults = {
    netThrust : Float;
    specificThrust : Float;
    TSFC : Float;
    thermalEfficiency : Float;
    propulsiveEfficiency : Float;
    overallEfficiency : Float;
    fuelFlowRate : Float;
  };

  public type Message = {
    timestamp : Int;
    userMessage : Text;
    aiResponse : Text;
  };

  let configs = Map.empty<Text, EngineConfig>();
  let performanceData = Map.empty<Text, PerformanceResults>();
  let chatHistory = Map.empty<Text, [Message]>();

  func getConfigInternal(name : Text) : EngineConfig {
    switch (configs.get(name)) {
      case (null) { Runtime.trap("Configuration " # name # " does not exist. ") };
      case (?config) { config };
    };
  };

  public shared ({ caller }) func saveConfig(config : EngineConfig) : async () {
    configs.add(config.name, config);
  };

  public query ({ caller }) func loadConfig(name : Text) : async EngineConfig {
    getConfigInternal(name);
  };

  public query ({ caller }) func listConfigs() : async [Text] {
    configs.keys().toArray();
  };

  public shared ({ caller }) func deleteConfig(name : Text) : async () {
    if (not configs.containsKey(name)) {
      Runtime.trap("Config " # name # " does not exist. ");
    };
    configs.remove(name);
    performanceData.remove(name);
  };

  public query ({ caller }) func getPerformance(name : Text) : async PerformanceResults {
    switch (performanceData.get(name)) {
      case (null) { Runtime.trap("No performance data for " # name # ". ") };
      case (?results) { results };
    };
  };

  public shared ({ caller }) func savePerformance(name : Text, results : PerformanceResults) : async () {
    if (not configs.containsKey(name)) {
      Runtime.trap("Config " # name # " is missing. ");
    };
    performanceData.add(name, results);
  };

  public shared ({ caller }) func addChatSession(sessionId : Text) : async () {
    if (chatHistory.containsKey(sessionId)) {
      Runtime.trap("Session " # sessionId # " already exists. ");
    };
    chatHistory.add(sessionId, []);
  };

  public shared ({ caller }) func addMessage(sessionId : Text, userMessage : Text, aiResponse : Text) : async () {
    let timestamp = Time.now();
    let message : Message = {
      timestamp;
      userMessage;
      aiResponse;
    };

    switch (chatHistory.get(sessionId)) {
      case (null) { Runtime.trap("Session " # sessionId # " does not exist. ") };
      case (?history) {
        let newHistory = history.concat([message]);
        chatHistory.add(sessionId, newHistory);
      };
    };
  };

  public query ({ caller }) func getChatHistory(sessionId : Text) : async [Message] {
    switch (chatHistory.get(sessionId)) {
      case (null) { Runtime.trap("Session " # sessionId # " does not exist. ") };
      case (?history) { history };
    };
  };

  public shared ({ caller }) func deleteChatSession(sessionId : Text) : async () {
    if (not chatHistory.containsKey(sessionId)) {
      Runtime.trap("Session " # sessionId # " does not exist. ");
    };
    chatHistory.remove(sessionId);
  };

  public query ({ caller }) func getAllChatSessions() : async [Text] {
    chatHistory.keys().toArray();
  };

  public query ({ caller }) func calculatePerformance(config : EngineConfig) : async PerformanceResults {
    let netThrust = (config.massFlow * config.exhaustVelocity) + ((config.exhaustPressure - config.ambientPressure) * config.exitArea) - (config.massFlow * config.flightSpeed);
    let specificThrust = netThrust / config.massFlow;
    let TSFC = 0.6;
    let thermalEfficiency = 0.35;
    let propulsiveEfficiency = (2.0 * config.flightSpeed) / (config.exhaustVelocity + config.flightSpeed);
    let overallEfficiency = thermalEfficiency * propulsiveEfficiency;
    let fuelFlowRate = 0.8;

    {
      netThrust;
      specificThrust;
      TSFC;
      thermalEfficiency;
      propulsiveEfficiency;
      overallEfficiency;
      fuelFlowRate;
    };
  };
};
