#include <DHT.h>

#define DHTPIN 7
#define DHTTYPE DHT11

#define WIND_SENSOR A0

#define GREEN_LED 8
#define RED_LED 9

DHT dht(DHTPIN, DHTTYPE);

float filteredVoltage = 0;

void setup()
{
  Serial.begin(9600);

  analogReference(INTERNAL);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);

  dht.begin();

  Serial.println("Weather Station Started");
}

void loop()
{

  // ==========================
  // Wind Sensor
  // ==========================

  long sum = 0;

  for(int i=0;i<100;i++)
  {
      sum += analogRead(WIND_SENSOR);
      delay(2);
  }

  float adc = sum/100.0;

  float voltage = adc * 1.1 / 1023.0;


  // Exponential filter

  filteredVoltage =
      0.9*filteredVoltage +
      0.1*voltage;



  // Estimated wind speed


  float windSpeed = filteredVoltage * 80.0;


  if(windSpeed < 0.5)
      windSpeed = 0;



  // ==========================
  // DHT11
  // ==========================


  float temp = dht.readTemperature();

  float hum = dht.readHumidity();



  // ==========================
  // LEDs
  // ==========================


  if(windSpeed < 6)
  {
      digitalWrite(GREEN_LED,HIGH);
      digitalWrite(RED_LED,LOW);
  }

  else
  {
      digitalWrite(GREEN_LED,LOW);
      digitalWrite(RED_LED,HIGH);
  }



  // ==========================
  // Serial Monitor
  // ==========================


  Serial.println();

  Serial.print("Temperature : ");
  Serial.print(temp);
  Serial.println(" C");



  Serial.print("Humidity : ");
  Serial.print(hum);
  Serial.println(" %");



  Serial.print("Voltage : ");
  Serial.print(filteredVoltage,3);
  Serial.println(" V");



  Serial.print("Wind Speed : ");
  Serial.print(windSpeed,1);
  Serial.println(" km/h");



  delay(1000);

}
