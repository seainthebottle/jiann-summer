let pieChart;

const charts = {
    renderDailyPie(data) {
        const ctx = document.getElementById('daily-pie-chart').getContext('2d');
        
        if (pieChart) {
            pieChart.destroy();
        }

        if (data.length === 0) {
            // 데이터가 없을 때의 처리
            return;
        }

        const labels = data.map(item => item.name);
        const totals = data.map(item => item.total_seconds / 60); // 분 단위로 표시

        pieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: totals,
                    backgroundColor: [
                        '#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#94d82d', '#cc5de8', '#ff922b'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-color')
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${Math.round(context.raw)}분`;
                            }
                        }
                    }
                }
            }
        });
    }
};

window.charts = charts;
