/*global WHO, Backbone, JST*/

WHO.Views = WHO.Views || {};

(function () {
    'use strict';

    function lastSunday(date) {
        date.setDate(date.getDate() - date.getDay());
        return new Date(date.getFullYear() + ', ' + (date.getMonth() + 1) + ', ' + date.getDate());
    }

    WHO.Views.epiGraph = Backbone.View.extend({

        events: {},
        initialize: function () {

            // Show spinner until load
            this.spinner = new Spinner({
                color: '#888',
                length: 2,
                speed: 0.8
            }).spin(document.getElementById('epi-graph-loader'));

        },

        load: function() {

            if (this.collection.length) {
                this.render();
            }
            else {
                this.listenToOnce(this.collection, 'loaded', this.render);
                this.collection.query();
            }
        },

        drawChart: function(data) {
            this.spinner.stop();

            var margin = {top: 10, right: 60, bottom: 30, left: 60},
                width = this.$el.width() - margin.left - margin.right,
                height = 180 - margin.top - margin.bottom;

            var max = d3.max(data, function(d) { return d.total;});

            var x = d3.scale.linear()
                .rangeRound([0, width])
                .domain([0, data.length]);

            var y = d3.scale.linear()
                .range([height, 0])
                .domain([0, max]);

            var barW = Math.floor(width / data.length) - 1,
                halfBar = barW / 2;

            var order = this.order,
                ticks = [];

            _.each(data, function(d, i) {
                var y0 = 0;
                d.bars = _.map(d.vals, function(val, i) {
                    return {
                        name: order[i],
                        y0: y0,
                        y1: y0 += val,
                        val: val
                    }
                });

                if (i % 5 === 0) {
                    ticks.push({
                        position: i,
                        display: d.time
                    });
                }
            });

            // var line = d3.svg.line()
                // .x(function(d, i) { return x(i); })
                // .y(function(d) { return y(d.total); })
                // .interpolate('basis');

            var yAxis = d3.svg.axis()
                .scale(y)
                .orient("right");

            var format = d3.time.format("%d-%m-%Y");
            var template = _.template('<h4><%= date %></h4><p>Confirmed: <%= confirmed %><br />Probable: <%= probable %><br />Suspected: <%= suspected %>');

            var tip = d3.tip()
                .attr('class', 'd3-tip')
                .html(function(d) {
                    return template({
                        date: format(d.time),
                        confirmed: d.vals[0],
                        probable: d.vals[1],
                        suspected: d.vals[2]
                    });
                });

            var svg = d3.select("#epi-graph").append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
            .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            svg.call(tip);

            var columns = svg.selectAll(".week")
                .data(data)
            .enter().append("g")
                .attr("class", "week")
                .attr("transform", function(d, i) { return "translate(" + (x(i) - halfBar) + ",0)"; })
                .on('mouseover', tip.show)
                .on('mouseout', tip.hide);

            var bars = columns.selectAll("rect")
                .data(function(d) { return d.bars; })
            .enter().append("rect")
                .attr("width", barW)
                .attr('y', function(d) { return y(d.y1) })
                .attr('height', function(d) { return height - y(d.val) || 1; })
                .attr('class', function(d) { return d.name; });

            var xAxis = svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + (height + 3) + ")")
                .selectAll('.tick')
                .data(ticks)
              .enter().append('g')
                .attr('class', 'tick')
                .attr('transform', function(d) { return 'translate(' + x(d.position) + ',0)'; });

            xAxis.append('line')
                .attr('x1', 0)
                .attr('x2', 0)
                .attr('y1', 0)
                .attr('y2', 5)
                .style('stroke-width', '2');

            xAxis.append('text')
                .text(function(d) { return format(d.display); })
                .style("text-anchor", "middle")
                .attr("dy", "15px");

            svg.append("g")
                .attr('transform', 'translate(' + width + ',0)')
                .attr("class", "y axis")
                .call(yAxis)
            .append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", 6)
                .attr("dy", "-.8em")
                .style("text-anchor", "end")
                .text("Cases");

            // var path = svg.append('path')
                // .datum(data)
                // .attr('class', 'case-line')
                // .attr('d', line);

            var l = data.length;
            columns.transition()
                .duration(0)
                .delay(function(d, i) { return (l - i) * 20 })
                .attr('class', 'week active');
        },

        render: function () {

            // old method relies on an absolute 'start' day, which is ok but not the best
            // since days are already sorted, we just need to find the sunday before the first date
            // http://stackoverflow.com/questions/6024328/the-closest-sunday-before-given-date-with-javascript
            // var d = Date.parse('01/05/2014'),
                // allWeeks = [], i = 0,
                // model;

            // while (d < this.collection.models[this.collection.models.length - 1].get("datetime")) {
                // allWeeks[i] = {week: new Date(d), Suspected: 0, Probable: 0, Confirmed: 0};
                // d += (7*1000*3600*24);
                // i++;
            // }

            var earliest = new Date(this.collection.at(0).get('datetime')),
                latest = new Date(this.collection.at(this.collection.length - 1).get('datetime'));

            var oneWeek = 1000 * 60 * 60 * 24 * 7,
                startWeek = Date.parse(lastSunday(earliest));

            var nextWeek = startWeek + oneWeek,
                format = {Suspected: 0, Probable: 0, Confirmed: 0, Total: 0},
                weeks = [_.clone(format)],
                onWeek = 0,
                model,
                date,
                category;

            weeks[0].week = new Date(startWeek);

            for (var i = 0, ii = this.collection.length; i < ii; ++i) {
                model = this.collection.at(i);
                date = model.get('datetime');

                // since dates are sorted, we can just keep adding weeks as we go
                while (date > nextWeek) {
                    onWeek += 1;
                    weeks.push(_.clone(format));
                    weeks[onWeek].week = new Date(nextWeek);
                    nextWeek += oneWeek;
                }

                category = model.get('case category');
                if (category in weeks[onWeek]) {
                    weeks[onWeek][category] += 1;
                    weeks[onWeek].Total += 1;
                }
            };

            this.order = ['confirmed', 'probable', 'suspected'];
            var weeks = _.map(weeks.slice(0,-1), function(week) {
                return {
                    vals: [week.Confirmed, week.Probable, week.Suspected],
                    total: week.Total,
                    time: new Date(week.week)
                };
            });

            this.drawChart(weeks);
        },
    });
})();
