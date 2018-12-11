/**
 * Main application
 */
(function () {

    var appName = "d3-play";

    var app = angular.module(appName, [
        "ngResource"
    ]);

    app.run(["$log",
        function ($log) {
            $log.debug(appName + " is running");
        }
    ]);

    app.factory("RoomsResource", ["$log", "$resource",
        function ($log, $resource) {
            return $resource("data/rooms.json");
        }
    ]);

    app.factory("SensorsResource", ["$resource",
        function ($resource) {
            return $resource("data/sensors/:roomId.json")
        }
    ]);

    app.factory("RoomService", ["$log", "RoomsResource", "SensorsResource",
        function ($log, roomsResource, sensorsResource) {
            return {
                getRooms: function (successCb, errorCb) {
                    roomsResource.query({}).$promise.then(function (response) {
                        successCb(response);
                    }, function (error) {
                        (errorCb || angular.noop)(error.data);
                    });
                },
                getSensors: function (roomId, successCb, errorCb) {
                    sensorsResource.query({ roomId: roomId }).$promise.then(function (response) {
                        successCb(response);
                    }, function (error) {
                        (errorCb || angular.noop)(error.data);
                    });
                },
                getSensorData: function (sensorId, successCb, errorCb) {
                    // This one we fake
                    var temperatures = [];
                    var now = new Date().getTime();
                    for (var i = 59; i >= 0; --i) {
                        var dataPoint = {};
                        dataPoint.timestamp = now - (i * 60 * 1000);
                        dataPoint.temperature = Math.floor(Math.random() * 30 + 180) / 10;
                        temperatures.unshift(dataPoint);
                    }
                    successCb(temperatures);
                }
            }
        }
    ]);

    app.controller("RoomsController", ["$log", "RoomService",
        function ($log, roomsService) {
            $log.debug("RoomsController: starting");

            var that = this;
            that.rooms = [];

            roomsService.getRooms(function (rooms) {
                $log.debug("RoomsController: got rooms %o", rooms);
                angular.copy(rooms, that.rooms);
            }, function (error) {
                $log.debug("RoomsController: error fetching rooms %o", error);
            });
        }
    ]);

    app.directive("rooms", [
        function () {
            return {
                restrict: "E",
                templateUrl: "views/rooms.directive.html",
                replace: true,
                controller: "RoomsController",
                controllerAs: "roomsCtrl"
            }
        }
    ]);

    app.controller("RoomController", ["$log", "$scope", "RoomService",
        function ($log, $scope, roomService) {
            $log.debug("RoomController: starting - scope = %o", $scope);

            var that = this;
            that.room = $scope.src;
            that.sensors = [];

            roomService.getSensors(that.room.id, function (sensors) {
                $log.debug("RoomController: got sensors %o", sensors);
                angular.copy(sensors, that.sensors);
            }, function (error) {
                $log.error("RoomController: error fetching sensors: %o", error);
            })

        }
    ]);

    app.directive("room", [
        function () {
            return {
                restrict: "E",
                scope: {
                    src: "="
                },
                templateUrl: "views/room.directive.html",
                controller: "RoomController",
                controllerAs: "roomCtrl"
            }
        }
    ]);

    app.controller("RoomGraphController", ["$log", "$scope", "$window", "$interval", "RoomService",
        function ($log, $scope, $window, $interval, roomService) {
            $log.debug("RoomGraphController: starting");

            var padding = 5;

            var interval = null;
            var svg = null;
            var d3 = null;

            var that = this;

            that.sensors = $scope.sensors;
            //that.sensorData = {};

            // Refresh data - called once per minute but will not be called before sensors and svg element is ready
            that.refreshData = function () {
                $log.debug("RoomGraphController: refreshData");
                var sensorData = {};
                async.eachSeries(that.sensors, function (sensor, doneSensor) {
                    $log.debug("RoomGraphController: getting sensor data for sensor = %o", sensor);
                    roomService.getSensorData(sensor.id, function (sensorDataset) {
                        $log.debug("RoomGraphController: got sensor data = %o", sensorDataset);
                        sensorData[sensor.id] = sensorDataset;
                        doneSensor();
                    });
                }, function () {
                    $log.debug("RoomGraphController: Got data from all sensors = %o", sensorData);

                    // Determine min/max values
                    var xmin = 100000000000000, xmax = 0, ymin = 200, ymax = -200;
                    Object.keys(sensorData).forEach(function (key) {
                        $log.debug("RoomGraphController: searching min/max for dataset = %o", key);
                        sensorData[key].forEach(function (dataPoint) {
                            if (dataPoint.timestamp < xmin) xmin = dataPoint.timestamp;
                            if (dataPoint.timestamp > xmax) xmax = dataPoint.timestamp;
                            if (dataPoint.temperature < ymin) ymin = dataPoint.temperature;
                            if (dataPoint.temperature > ymax) ymax = dataPoint.temperature;
                        })
                    });

                    $log.debug("RoomGraphController: xmin = %o, xmax = %o, ymin = %o, ymax = %o", xmin, xmax, ymin, ymax);

                    var xScale = d3.scaleLinear()
                        .domain([xmin, xmax])
                        .range([padding + 5, $scope.svgElement.clientWidth - padding]);

                    var yScale = d3.scaleLinear()
                        .domain([0, ymax])
                        .range([$scope.svgElement.clientHeight, 0]);

                    var xAxisGen = d3.axisBottom()
                        .scale(xScale)
                        .ticks(5);

                    var yAxisGen = d3.axisLeft()
                        .scale(yScale)
                        .ticks(5);

                    svg.append("svg:g")
                        .attr("class", "x axis")
                        //.attr("transform", "translate(0,180)")
                        .call(xAxisGen);

                    svg.append("svg:g")
                        .attr("class", "y axis")
                        //.attr("transform", "translate(0,180)")
                        .call(yAxisGen);
                });
            }

            $scope.$watch(function () {
                // Check all prerequisites for d3 generation
                return $window.d3 && $scope.svgElement && $scope.sensors && $scope.sensors.length > 0;
            }, function (state) {
                $log.debug("RoomGraphController: state = %o", state);

                d3 = $window.d3;
                svg = d3.select($scope.svgElement)
                    .style("width", "100%")
                    .style("border", "1px solid blue");

                interval = $interval(function () {
                    that.refreshData();
                }, 60000); // every minute

                that.refreshData();

            });

            $scope.$on("$destroy", function () {
                if (interval) {
                    $interval.cancel(interval);
                    interval = null;
                }
            });

        }
    ]);

    app.directive("roomGraph", ["$log",
        function ($log) {
            return {
                restrict: "E",
                scope: {
                    sensors: "="
                },
                replace: true,
                link: function (scope, elem) {
                    scope.svgElement = elem[0].getElementsByTagName("svg")[0];
                },
                templateUrl: "views/room-graph.directive.html",
                controller: "RoomGraphController",
                controllerAs: "roomGraphCtrl"
            }
        }
    ]);

})();
/**
 * vim: ts=4 et nowrap autoindent
 */