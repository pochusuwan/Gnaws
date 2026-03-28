import "./InstanceTypeGuide.css";

const families = [
    {
        tag: "General Purpose",
        family: "t3 Family",
        desc: "Burstable CPU - runs at a baseline and bursts when needed. Suitable for most games, including occasionally CPU-intensive ones. A good default choice for the majority of setups.",
        bestFor: "Small groups, non-intensive or occasionally intensive games",
        warn: "⚠ During long intensive sessions, CPU burst credits will deplete and performance will drop. Upgrade to a larger t3 or c6i if performance degrades.",
    },
    {
        tag: "Compute Optimized",
        family: "c6i Family",
        desc: "Fixed, consistent CPU performance with no burst limits. Best for games with sustained, predictable CPU usage. Not cost-effective for low-intensity games where a t3 burstable instance is sufficient.",
        bestFor: "Larger groups, CPU-intensive games, long sessions",
        warn: null,
    },
    {
        tag: "Memory Optimized",
        family: "r6i Family",
        desc: "More RAM relative to CPU. For games that load large worlds or run heavy modpacks. Rarely needed. Only consider if your game is specifically constrained by memory rather than CPU.",
        bestFor: "Large Minecraft worlds, modpacks with high memory needs",
        warn: null,
    },
];

const instanceGroups = [
    {
        family: "General Purpose",
        instances: [
            { name: "t3.small",   vcpu: 2, ram: "2 GB",  price: 0.0208 },
            { name: "t3.medium",  vcpu: 2, ram: "4 GB",  price: 0.0416 },
            { name: "t3.large",   vcpu: 2, ram: "8 GB",  price: 0.0832 },
            { name: "t3.xlarge",  vcpu: 4, ram: "16 GB", price: 0.1664 },
            //{ name: "t3.2xlarge", vcpu: 8, ram: "32 GB", price: 0.3328 },
        ],
    },
    {
        family: "Compute Optimized",
        instances: [
            { name: "c6i.large",  vcpu: 2, ram: "4 GB",  price: 0.085 },
            { name: "c6i.xlarge",  vcpu: 4, ram: "8 GB",  price: 0.1700 },
            { name: "c6i.2xlarge", vcpu: 8, ram: "16 GB", price: 0.3400 },
        ],
    },
    {
        family: "Memory Optimized",
        instances: [
            { name: "r6i.xlarge", vcpu: 4, ram: "32 GB", price: 0.2520, monthly: "~$21.16/mo" },
        ],
    },
];

export default function InstanceTypeGuide() {
    return (
        <div className="instanceTypeRoot">
            <section className="instanceType-section">
                <div className="instanceType-sectionLabel">Instance Families</div>
                <div className="instanceType-cards">
                    {families.map((f) => (
                        <div className="instanceType-card" key={f.family}>
                            <div className="instanceType-cardFamily">{f.tag} - {f.family}</div>
                            <div className="instanceType-cardDesc">{f.desc}</div>
                            <div className="instanceType-cardWhen">
                                <strong>Best for</strong>
                                {f.bestFor}
                            </div>
                            {f.warn && <div className="instanceType-warn">{f.warn}</div>}
                        </div>
                    ))}
                </div>
            </section>

            <section className="instanceType-section">
                <div className="instanceType-tableWrap">
                    <table className="instanceType-table">
                        <thead>
                            <tr>
                                <th>Instance</th>
                                <th>Family</th>
                                <th>vCPU</th>
                                <th>RAM</th>
                                <th>$/hr</th>
                                <th>~21 hrs/wk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {instanceGroups.map((group) => (
                                <>
                                    {group.instances.map((inst) => (
                                        <tr key={inst.name}>
                                            <td><span className="instanceType-instanceName">{inst.name}</span></td>
                                            <td>{group.family}</td>
                                            <td>{inst.vcpu}</td>
                                            <td>{inst.ram}</td>
                                            <td>${inst.price.toFixed(4)}</td>
                                            <td>~${(inst.price*21*4).toFixed(2)}/mo</td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="instanceType-note">
                    Price vary by region and may be outdated. More instance family available. See{" "}
                    <a href="https://aws.amazon.com/ec2/pricing/on-demand/" target="_blank" rel="noreferrer">
                        AWS EC2 On-Demand Pricing
                    </a>
                </p>
            </section>
        </div>
    );
}
